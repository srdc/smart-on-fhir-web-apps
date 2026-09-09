import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { environment } from "../../environments/environment";
import {
  AppMetadata,
  SmartAppMetadata,
  ModelCardMetadata,
  ModelCardPipeline,
  ModelCardStratum,
  DiseasePerformance,
  FairnessResult
} from "../../environments/AppMetadata";

@Component({
  selector: 'app-application-metadata',
  templateUrl: './application-metadata.component.html',
  styleUrl: './application-metadata.component.scss'
})
export class ApplicationMetadataComponent {

  app: AppMetadata | undefined;
  appMetadata: SmartAppMetadata | undefined;

  // Loaded model-card JSON will be stored here
  modelCard: ModelCardMetadata | undefined;

  // Loaded pipeline performance JSON will be stored here
  modelCardPipeline: ModelCardPipeline | undefined;

  // User-selected performance stratum
  selectedSex = '';
  selectedAgeGroup = '';
  selectedFeatureSet = '';
  selectedDiseaseName = '';
  selectedFairnessDiseaseName = '';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient
  ) {
    this.route.params.subscribe(params => {
      this.setApp(params['id']);
    });
  }

  private setApp(id: string) {

    this.app = environment.appSections
      .flatMap(section => section.apps)
      .find(app => app.id === id);

    this.appMetadata = this.app?.metadata || undefined;

    // Reset when navigating between applications
    this.modelCard = undefined;

    this.modelCardPipeline = undefined;
    this.selectedSex = '';
    this.selectedAgeGroup = '';
    this.selectedFeatureSet = '';
    this.selectedDiseaseName = '';

    // Load model card only if this application has one
    if (this.appMetadata?.modelCardUrl) {
      this.loadModelCard(this.appMetadata.modelCardUrl);
    }

    if (this.appMetadata?.modelCardPipelineUrl) {
      this.loadModelCardPipeline(this.appMetadata.modelCardPipelineUrl);
    }

    console.log(this.app, this.appMetadata);
  }

  private loadModelCard(url: string) {

    this.http.get<ModelCardMetadata>(url).subscribe({
      next: modelCard => {
        this.modelCard = modelCard;
        console.log('Model card loaded:', modelCard);
      },
      error: error => {
        console.error('Failed to load model card:', error);
        this.modelCard = undefined;
      }
    });
  }

  private loadModelCardPipeline(url: string) {

    this.http.get<ModelCardPipeline>(url).subscribe({
      next: modelCardPipeline => {
        this.modelCardPipeline = modelCardPipeline;
        console.log('Model card pipeline loaded:', modelCardPipeline);
      },
      error: error => {
        console.error('Failed to load model card pipeline:', error);
        this.modelCardPipeline = undefined;
      }
    });
  }

  get availableSexes(): string[] {
    return this.uniqueValues(
      this.pipelineStrata.map(stratum => stratum.sex)
    );
  }

  get availableAgeGroups(): string[] {
    return this.uniqueValues(
      this.pipelineStrata.map(stratum => stratum.age_group)
    );
  }

  get availableFeatureSets(): string[] {
    return this.uniqueValues(
      this.pipelineStrata.map(stratum => stratum.feature_set)
    );
  }

  get selectedStratum(): ModelCardStratum | undefined {
    if (
      !this.selectedSex ||
      !this.selectedAgeGroup ||
      !this.selectedFeatureSet
    ) {
      return undefined;
    }

    return this.pipelineStrata.find(stratum =>
      stratum.sex === this.selectedSex &&
      stratum.age_group === this.selectedAgeGroup &&
      stratum.feature_set === this.selectedFeatureSet
    );
  }

  get availableDiseases(): DiseasePerformance[] {
    return this.selectedStratum?.per_disease || [];
  }

  get selectedDisease(): DiseasePerformance | undefined {
    return this.availableDiseases.find(
      disease => disease.disease === this.selectedDiseaseName
    );
  }

  get aucPositionPercent(): number | undefined {
    const auc = this.selectedDisease?.discrimination?.auc;

    return auc === undefined
      ? undefined
      : this.scaleToPercentage(auc, 0, 1);
  }

  get aucCiStartPercent(): number | undefined {
    const lowerBound =
      this.selectedDisease?.discrimination?.ci_95_lo;

    return lowerBound === undefined
      ? undefined
      : this.scaleToPercentage(lowerBound, 0, 1);
  }

  get aucCiWidthPercent(): number | undefined {
    const lowerBound =
      this.selectedDisease?.discrimination?.ci_95_lo;

    const upperBound =
      this.selectedDisease?.discrimination?.ci_95_hi;

    if (lowerBound === undefined || upperBound === undefined) {
      return undefined;
    }

    const start =
      this.scaleToPercentage(lowerBound, 0, 1);

    const end =
      this.scaleToPercentage(upperBound, 0, 1);

    return Math.max(0, end - start);
  }

  get selectedDiseaseImdrfCategory(): string {
    if (!this.selectedDiseaseName) {
      return '-';
    }

    const categories =
      this.modelCard?.imdrf_risk_classification?.per_disease;

    if (
      categories?.category_I_non_serious_inform?.includes(
        this.selectedDiseaseName
      )
    ) {
      return 'Category I — Non-serious / Inform';
    }

    if (
      categories?.category_II_serious_inform?.includes(
        this.selectedDiseaseName
      )
    ) {
      return 'Category II — Serious / Inform';
    }

    return '-';
  }

  getDiseaseImdrfCategory(diseaseName: string): string {
    const perDisease =
      this.modelCard?.imdrf_risk_classification?.per_disease;

    if (!perDisease) {
      return '-';
    }

    if (
      perDisease.category_I_non_serious_inform?.includes(diseaseName)
    ) {
      return 'Category I — Non-serious / Inform';
    }

    if (
      perDisease.category_II_serious_inform?.includes(diseaseName)
    ) {
      return 'Category II — Serious / Inform';
    }

    return '-';
  }

  get selectedDiseaseAgeFairness(): FairnessResult[] {
    if (!this.selectedFairnessDiseaseName) {
      return [];
    }

    return (this.selectedStratum?.fairness?.by_age || []).filter(
      result => result.disease === this.selectedFairnessDiseaseName
    );
  }

  get selectedDiseaseEthnicityFairness(): FairnessResult[] {
    if (!this.selectedFairnessDiseaseName) {
      return [];
    }

    return (this.selectedStratum?.fairness?.by_ethnicity || []).filter(
      result => result.disease === this.selectedFairnessDiseaseName
    );
  }

  onSexChange(event: Event): void {
    this.selectedSex = (event.target as HTMLSelectElement).value;
    this.selectedDiseaseName = '';
    this.selectedFairnessDiseaseName = '';
  }

  onAgeGroupChange(event: Event): void {
    this.selectedAgeGroup = (event.target as HTMLSelectElement).value;
    this.selectedDiseaseName = '';
    this.selectedFairnessDiseaseName = '';
  }

  onFeatureSetChange(event: Event): void {
    this.selectedFeatureSet = (event.target as HTMLSelectElement).value;
    this.selectedDiseaseName = '';
    this.selectedFairnessDiseaseName = '';
  }

  onDiseaseChange(event: Event): void {
    this.selectedDiseaseName =
      (event.target as HTMLSelectElement).value;
  }

  onFairnessDiseaseChange(event: Event): void {
    this.selectedFairnessDiseaseName =
      (event.target as HTMLSelectElement).value;
  }

  private get pipelineStrata(): ModelCardStratum[] {
    return Object.values(this.modelCardPipeline?.strata || {});
  }

  private scaleToPercentage(
    value: number,
    minimum: number,
    maximum: number
  ): number {
    const clampedValue =
      Math.min(Math.max(value, minimum), maximum);

    return (
      (clampedValue - minimum) /
      (maximum - minimum)
    ) * 100;
  }

  private uniqueValues(values: string[]): string[] {
    return [...new Set(values)].sort();
  }

}