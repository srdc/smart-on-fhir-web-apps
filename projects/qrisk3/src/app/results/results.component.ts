import {Component, OnInit} from '@angular/core';
import {
  CarePlanHealthCardProfileProvider, CarePlanService, CDSAutoExecutor, CdsSimulationComponent, HealthCardProfile,
  ImportedHealthCardProfileProvider
} from "common"
import {environment} from "../../environments/environment";

@Component({
  selector: 'qrisk3-results',
  templateUrl: './results.component.html',
  styleUrl: './results.component.scss'
})
export class ResultsComponent extends CdsSimulationComponent implements CDSAutoExecutor, OnInit {

  override serviceName = environment.cds.serviceName
  override autoCallCdsService: true = true;

  valid = false
  initialScores: any[] = [];
  scores: any[] = [];

  /** Save Interventions: the selected suggestions become goals of the patient's active care plan */
  canSaveInterventions = false;
  savingInterventions = false;
  interventionsMessage?: { type: 'success' | 'danger', text: string };

  /**
   * Share Care Plan: the active care plan signed by the FHIR server as a Smart Health Card (needs $health-cards-issue),
   * and care plans received as signed cards (shared again unchanged)
   */
  healthCardProfiles: HealthCardProfile[] = [];
  hasActiveCarePlan = false;
  shareDialogOpen = false;

  private get carePlans(): CarePlanService {
    return this.injector.get(CarePlanService);
  }

  override async ngOnInit() {
    await super.ngOnInit();
    this.canSaveInterventions = await this.carePlans.canSave();
    if (this.canSaveInterventions) {
      this.loadShareProfiles();
    }
  }

  /** Care plan profiles to share, and whether the patient has an active care plan */
  async loadShareProfiles() {
    const patientId = this.patient?.id;
    if (!patientId) return;
    try {
      const [issued, received, active] = await Promise.all([
        this.injector.get(CarePlanHealthCardProfileProvider).profiles('Care Plan').catch(() => <HealthCardProfile[]>[]),
        this.injector.get(ImportedHealthCardProfileProvider).profilesFor(patientId, 'CarePlan').catch(() => <HealthCardProfile[]>[]),
        this.carePlans.findActiveCarePlan(patientId)
      ]);
      this.hasActiveCarePlan = !!active.carePlan;
      this.healthCardProfiles = [...(this.hasActiveCarePlan ? issued : []), ...received];
    } catch (err) {
      console.warn('Care plan sharing is not available', err);
      this.healthCardProfiles = [];
    }
  }

  /** Observations of the selected suggestions (the targets to reach) */
  get selectedObservations(): fhir4.Observation[] {
    return this.suggestions
      .flatMap((card: any) => card.suggestions || [])
      .filter((suggestion: any) => suggestion.apply)
      .map((suggestion: any) => suggestion.actions?.at(0)?.resource)
      .filter((resource: any) => resource?.resourceType === 'Observation' && !!resource.code);
  }

  async saveInterventions() {
    const observations = this.selectedObservations;
    const patientId = this.patient?.id;
    if (!patientId || !observations.length || this.savingInterventions) return;
    this.savingInterventions = true;
    this.interventionsMessage = undefined;
    try {
      const goals = observations.map(observation => CarePlanService.goalFromObservation(patientId, observation));
      const result = await this.carePlans.saveGoals(patientId, goals);
      const parts = [
        result.created.length ? `${result.created.length} goal${result.created.length > 1 ? 's' : ''} added` : '',
        result.updated.length ? `${result.updated.length} existing goal${result.updated.length > 1 ? 's' : ''} updated` : ''
      ].filter(Boolean).join(', ');
      this.interventionsMessage = {
        type: 'success',
        text: `Interventions saved${result.carePlanCreated ? ' to a new care plan' : ' to the active care plan'}: ${parts}.`
      };
      await this.loadShareProfiles();
    } catch (err: any) {
      console.error('Interventions could not be saved', err);
      this.interventionsMessage = {type: 'danger', text: 'The interventions could not be saved: ' + (err?.message || err)};
    } finally {
      this.savingInterventions = false;
    }
  }

  protected override handleServiceResponseAndSuggestions(response: any, updateSuggestions: boolean) {
    try {
      const qrisk3Card = response.cards.find((card: any) => card.uuid === 'CVD CARD SCORE')
      const qrisk3Obs = <fhir4.Observation>qrisk3Card.suggestions[0].actions[0].resource;
      if (updateSuggestions) {
        this.suggestions = response.cards.filter((card: any) => card !== qrisk3Card)
      }
      this.scores = [Math.floor((qrisk3Obs?.valueQuantity?.value || 0) * 100) / 100,
        Math.floor((qrisk3Obs?.referenceRange?.at(0)?.high?.value || 0) * 100) / 100]
      if (!this.initialScores.length) {
        this.initialScores = this.scores
      }
    } catch (err) {
      if (!response?.cards?.length) {
        this.error = 'QRISK3 cannot be calculated. Make sure all required inputs are provided.'
      }
    }
  }

  protected override resetScores() {
    this.scores = [];
  }

  override handleServiceError(err: any) {
    this.error = err?.message || err?.toString() || 'Unknown error';
  }
}
