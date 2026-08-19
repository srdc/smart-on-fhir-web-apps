import {Component, OnInit} from '@angular/core';
import {CdsHooksService} from "cds-hooks";
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {v4} from 'uuid';
import {InterventionService} from "../intervention.service";

@Component({
  selector: 'rp-interventions',
  templateUrl: './interventions.component.html',
  styleUrl: './interventions.component.scss'
})
export class InterventionsComponent implements OnInit {
  modifiableRiskFactors: { disease: string, riskFactors: { id: string, label: string }[] }[] = [];
  interventions: { label: string, id: string, goal: fhir4.Goal, existing?: fhir4.Goal, selected?: boolean }[] = [];
  loadingRiskFactors = true;
  loadingInterventions = true;
  selectedFn = (intervention: any) => intervention.selected;
  success?: string;
  error?: string;

  constructor(private cds: CdsHooksService<fhir4.Resource>, private sof: SmartOnFhirService,
              private interventionService: InterventionService) {
  }

  async ngOnInit() {
    this.loadingInterventions = true;
    this.loadingRiskFactors = true;
    const client = await this.sof.getClient();
    const patient = await this.sof.getPatient();
    if (!patient) { return; }
    await this.interventionService.loadCarePlan(patient.id!)
    this.cds.callService({
      language: 'en',
      serviceId: 'interventions',
      context: {
        patientId: patient?.id
      },
      prefetch: {},
      fhirServer: client?.state?.serverUrl,
      fhirAuthorization: client?.state?.tokenResponse
    }).then(response => {
      response.cards?.forEach((card: any) => {
        switch (card.uuid) {
          case 'modifiable-risk-factors':
            this.modifiableRiskFactors.push({
              disease: card.summary,
              riskFactors: card.suggestions.map((suggestion: any) => ({
                id: suggestion.uuid,
                label: suggestion.label
              }))
            })
            break;
          case 'interventions':
            card.suggestions?.forEach((suggestion: any) => {
              const suggestedGoal = <fhir4.Goal>suggestion.actions?.at(0)?.resource
              const getGoalCodes = (goal: fhir4.Goal) => [
                ...(goal.description.coding?.map(coding => coding.code) || []),
                ...(goal.target?.flatMap(target => target.measure?.coding?.map(coding => coding.code) || []) || []),
              ]
              const codes = getGoalCodes(suggestedGoal)
              const existing = this.interventionService.goals.find(goal => getGoalCodes(goal).some(code => codes.includes(code)))
              console.log(codes, existing)
              this.interventions.push({
                label: suggestion.label,
                id: suggestion.uuid,
                goal: suggestedGoal,
                existing
              })
            })
            break;
        }
      })
    }).finally(() => {
      this.loadingInterventions = false;
      this.loadingRiskFactors = false;
    })
  }

  async suggestInterventions() {
    if (!this.interventions.some(i => i.selected)) return;
    this.error = undefined;
    this.success = undefined;
    const patient = await this.sof.getPatient();
    const goals = this.interventions.filter(i => i.selected)
      .map(i => i.goal)
      .map(goal => {
        goal.id = v4();
        goal.lifecycleStatus = 'proposed';
        goal.statusDate = new Date().toISOString().split('T')[0];
        return goal;
      })
    try {
      await this.interventionService.createOrUpdateCarePlan(patient!.id!, goals)
      this.interventions.filter(i => i.selected)
        .forEach(i => {
          i.existing = i.goal;
          i.selected = false;
        })
      this.success = 'Intervention suggestions are sent.';
    } catch (err) {
      console.error(err)
      this.interventions.forEach(i => i.selected = false);
      this.error = 'Something went wrong. Please try again later.';
    }
  }
}
