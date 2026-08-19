import {AfterViewInit, Component, ElementRef, Input, OnChanges, OnInit, ViewChild} from '@angular/core';
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {InterventionService} from "../intervention.service";

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

  constructor(private sof: SmartOnFhirService, public interventionService: InterventionService) {
  }

  async ngOnInit() {
    const patient = await this.sof.getPatient()
    if (!this.interventionService.activeCarePlan) {
      this.interventionService.loadCarePlan(patient?.id!)
    }
    await this.interventionService.loadRelatedMeasurements(patient?.id!);
    console.log(this.interventionService.observationMap)
    console.log(this.interventionService.observationNameMap)
  }
}
