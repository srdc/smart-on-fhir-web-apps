import {AfterViewInit, Component, ElementRef, Input, OnChanges, OnInit, ViewChild} from '@angular/core';
import {HealthCardImportResult, ShlService, SmartOnFhirService} from "ng-smart-on-fhir";
import {
  CarePlanHealthCardProfileProvider, GoalMeasurement, GoalMeasurementService, HealthCardProfile,
  ImportedHealthCardProfileProvider, ReceivedHealthCardProfileProvider
} from 'common';
import {InterventionService} from "../intervention.service";

/**
 * Resources imported by Import Interventions: care plans, goals and the requests care plan activities refer to
 * (all in the Patient compartment, so patients can import them into their own record)
 */
const INTERVENTION_RESOURCE_TYPES = ['CarePlan', 'Goal', 'ServiceRequest', 'Task', 'MedicationRequest', 'NutritionOrder',
  'Appointment', 'DeviceRequest', 'RequestGroup'];

import {Pipe, PipeTransform} from '@angular/core';
import {Chart} from "chart.js/auto";

@Pipe({
  name: 'goalAcceptanceStatus',
  pure: true
})
export class GoalAcceptanceStatusPipe implements PipeTransform {
  transform(status?: 'proposed'|'planned'|'accepted'|'active'|'on-hold'|'completed'|'cancelled'|'entered-in-error'|'rejected'): any {
    switch (status) {
      case 'accepted':
      case 'active':
        return 'Accepted';
      case 'proposed':
        return 'Suggested';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }
}

@Component({
  selector: 'rp-observation-row-chart',
  template: `
    <canvas #canvas height="32"></canvas>
    <div class="chartjs-tooltip"></div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 32px;
    }

    canvas {
      width: 100% !important;
      height: 32px !important;
    }

    canvas:not(:hover) + .chartjs-tooltip {
      display: none;
    }
    .chartjs-tooltip {
      background: var(--bs-gray-dark);
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      color: white;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      white-space: nowrap;
      transform: translate(-50%, -100%);
    }
  `]
})
export class ObservationRowChartComponent implements AfterViewInit, OnChanges {
  @Input() observations: fhir4.Observation[] = [];

  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart<any, any, string>;


  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(): void {
    this.renderChart();
  }

  private renderChart(): void {
    if (!this.canvas) return;

    const points = this.observations.slice(0, 10)
      .map(o => ({
        date: o.effectiveDateTime ?? o.effectivePeriod?.start ?? '',
        value: o.valueQuantity?.value
      }))
      .filter(p => p.date && p.value !== undefined)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    this.chart?.destroy();

    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'line',
      data: {
        labels: points.map(p => p.date),
        datasets: [{
          data: points.map(p => p.value),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 12,

          tension: 0.3
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: this.externalTooltipHandler.bind(this)
            // callbacks: {
            //   title: (items) => {
            //     return new Date(items[0].label).toLocaleDateString();
            //   },
            //
            //   label: (ctx) => {
            //     return `${ctx.raw}`;
            //   }
            // }
          }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        elements: {
          line: { fill: false }
        }
      }
    });
  }

  private externalTooltipHandler(context: any): void {
    const { chart, tooltip } = context;

    let tooltipEl = chart.canvas.parentNode.querySelector('.chartjs-tooltip');

    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = '0';
      return;
    }

    const title = tooltip.title?.[0] ?? '';
    const value = tooltip.body?.[0]?.lines?.[0] ?? '';

    tooltipEl.innerHTML = `
    <div>${title}</div>
    <div>${value}</div>
  `;

    const rect = chart.canvas.getBoundingClientRect();

    tooltipEl.style.opacity = '1';
    tooltipEl.style.left = `${rect.left + tooltip.caretX}px`;
    tooltipEl.style.top = `${rect.top + tooltip.caretY - 8}px`;
  }
}

@Component({
  selector: 'rp-care-plan',
  templateUrl: './care-plan.component.html',
  styleUrl: './care-plan.component.scss'
})
export class CarePlanComponent implements OnInit {

  patientId?: string;
  patient?: fhir4.Patient;
  /**
   * Care plan health card profiles: the active plan issued (signed) by this FHIR server (empty when it does not support
   * $health-cards-issue), and the care plans received as Smart Health Cards, shared as signed by their issuers
   */
  healthCardProfiles: HealthCardProfile[] = [];
  /** Create Smart Health Card dialog (app-share-health-card-dialog) */
  shareDialogOpen = false;
  /** Import Interventions dialog (app-import-health-card) */
  importDialogOpen = false;
  readonly interventionResourceTypes = INTERVENTION_RESOURCE_TYPES;
  /** Add measurement dialog, with the preselected measurement (key) */
  measurementDialog?: { selected?: string };
  private measurementsOf?: { goals: fhir4.Goal[], measurements: GoalMeasurement[] };
  /** FHIR server of the session; plans with another meta.source were received from elsewhere */
  private serverUrl?: string;

  userIsPatient = this.sof.getUser().then(user => user?.resourceType === 'Patient')

  constructor(private sof: SmartOnFhirService, public interventionService: InterventionService,
              private carePlanHealthCard: CarePlanHealthCardProfileProvider,
              private importedHealthCards: ImportedHealthCardProfileProvider, private shl: ShlService,
              private receivedHealthCards: ReceivedHealthCardProfileProvider) {
  }

  async ngOnInit() {
    this.sof.getClient().then(client => this.serverUrl = client?.state.serverUrl).catch(() => undefined);
    const patient = await this.sof.getPatient()
    this.patient = patient;
    this.patientId = patient?.id;
    this.loadHealthCardProfiles();
    if (!this.interventionService.activeCarePlan) {
      await this.interventionService.loadCarePlan(patient?.id!)
    }
    await this.loadMeasurements();
  }

  /** What can be measured for the goals of the plan (codes with a quantity or coded target) */
  get measurements(): GoalMeasurement[] {
    const goals = this.interventionService.goals;
    if (this.measurementsOf?.goals !== goals) {
      this.measurementsOf = {goals, measurements: GoalMeasurementService.measurements(goals)};
    }
    return this.measurementsOf.measurements;
  }

  /** Measurement of a goal (key), if one can be recorded */
  measurementKey(goal: fhir4.Goal): string | undefined {
    return GoalMeasurementService.measurements([goal])[0]?.key;
  }

  /** Related measurements: LIVA data and the observations of the goal codes */
  async loadMeasurements() {
    if (!this.patientId) return;
    const codes = this.measurements.map(m => m.key).filter(key => key.includes('|'));
    await this.interventionService.loadRelatedMeasurements(this.patientId, codes);
  }

  /** Latest value of an observation as text */
  valueText(observation: fhir4.Observation): string {
    if (observation.valueQuantity) {
      return `${observation.valueQuantity.value ?? ''} ${observation.valueQuantity.unit || observation.valueQuantity.code || ''}`.trim();
    }
    const concept = observation.valueCodeableConcept;
    return concept ? concept.text || concept.coding?.map(c => c.display || c.code).join(', ') || '' : '';
  }

  private async loadHealthCardProfiles() {
    const [issued, received] = await Promise.all([
      this.carePlanHealthCard.profiles('Intervention Plan').catch(() => []),
      this.patientId ? this.importedHealthCards.profilesFor(this.patientId, 'CarePlan').catch(err => {
        console.warn('Received care plan cards could not be loaded', err);
        return <HealthCardProfile[]>[];
      }) : Promise.resolve(<HealthCardProfile[]>[])
    ]);
    // care plans the patient received and keeps in Shared Links (while unlocked)
    const kept = await this.receivedHealthCards.profilesFor('CarePlan').catch(() => <HealthCardProfile[]>[]);
    this.healthCardProfiles = [...issued, ...received, ...kept];
  }

  /** Where the active care plan was received from (meta.source = issuer of the imported card), if not made here */
  get carePlanOrigin(): { name: string, url: string, trusted: boolean } | undefined {
    return this.originOf(this.interventionService.activeCarePlan);
  }

  /**
   * Where a resource was imported from: its meta.source (the issuer of the card it came with, or its original source),
   * when it is another server than the one of the session
   */
  originOf(resource: fhir4.Resource | undefined): { name: string, url: string, trusted: boolean } | undefined {
    const source = resource?.meta?.source;
    const normalize = (url: string) => url.replace(/\/+$/, '');
    if (!source || !/^https?:\/\//.test(source) || (this.serverUrl && normalize(source) === normalize(this.serverUrl))) {
      return undefined;
    }
    let origin = this.origins.get(source);
    if (!origin) {
      // one object per source (change detection)
      const trusted = this.shl.trustedIssuer(source);
      origin = {name: trusted?.name || source, url: source, trusted: !!trusted};
      this.origins.set(source, origin);
    }
    return origin;
  }
  private origins = new Map<string, { name: string, url: string, trusted: boolean }>();

  /**
   * Import Interventions, before writing: when the patient has an active care plan, the goals and activities of the
   * imported care plan(s) are added to it instead of storing another plan (goals and activity resources are stored with
   * meta.source = card issuer, unless they have a source)
   */
  readonly mergeIntoActivePlan = async (resources: fhir4.Resource[]): Promise<fhir4.Resource[]> => {
    const imported = <fhir4.CarePlan[]>resources.filter(resource => resource.resourceType === 'CarePlan');
    const active = imported.length && this.patientId ? await this.interventionService.loadCarePlan(this.patientId) : undefined;
    if (!active?.id) {
      return resources;
    }
    const merged = imported.reduce((plan, other) => InterventionService.mergeCarePlan(plan, other), active);
    const importedRefs = new Set(imported.map(plan => 'CarePlan/' + plan.id));
    return [
      ...resources.filter(resource => resource.resourceType !== 'CarePlan').map(resource => {
        if (resource.resourceType !== 'DocumentReference') {
          return resource;
        }
        // the kept original card now relates to the active plan its interventions were added to
        const documentReference = <fhir4.DocumentReference>resource;
        const related = (documentReference.context?.related || []).filter(ref => !importedRefs.has(ref.reference || ''));
        return <fhir4.DocumentReference>{...documentReference, context: {...documentReference.context, related: [...related, {reference: 'CarePlan/' + active.id}]}};
      }),
      merged
    ];
  };

  /** After Import Interventions: reload the plan */
  async onImported(result: HealthCardImportResult) {
    if (this.patientId) {
      await this.interventionService.loadCarePlan(this.patientId);
      this.loadHealthCardProfiles();
      this.loadMeasurements();
    }
  }
}
