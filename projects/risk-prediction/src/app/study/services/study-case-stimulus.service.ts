import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable, forkJoin, from, of, throwError} from 'rxjs';
import {catchError, map, shareReplay, switchMap} from 'rxjs/operators';
import {WaterfallData} from '../../results/llm-models';
import {
  FrozenStudyCase,
  FrozenStudyCaseCatalog,
  StudyCaseStimulus
} from '../models/frozen-study-case';
import {getStudyCaseDefinition} from '../study-sequence.config';

export class FrozenStudyCaseIntegrityError extends Error {}

/** Immutable catalog boundary. A future backend catalog can replace this service unchanged by callers. */
@Injectable({providedIn: 'root'})
export class StudyCaseStimulusService {
  private readonly catalogUrl = 'assets/study/study_cases.json';
  private readonly catalog$ = this.http.get<FrozenStudyCaseCatalog>(this.catalogUrl).pipe(
    switchMap(catalog => {
      this.validateCatalog(catalog);
      return from(this.sha256(this.canonicalizeWithoutHash(catalog))).pipe(map(hash => {
        if (hash !== catalog.contentHash) {
          throw new FrozenStudyCaseIntegrityError('Frozen Study catalog failed SHA-256 content validation.');
        }
        return catalog;
      }));
    }),
    shareReplay(1)
  );
  private readonly frozenCases = new Map<string, Observable<StudyCaseStimulus>>();

  constructor(private http: HttpClient) {}

  hasCatalogEntry(caseId: string): Observable<boolean> {
    return this.catalog$.pipe(
      map(catalog => Object.prototype.hasOwnProperty.call(catalog.cases, caseId)),
      catchError(error => throwError(() => this.integrityError('Frozen Study catalog could not be loaded.', error)))
    );
  }

  getCase(caseId: string): Observable<StudyCaseStimulus> {
    return this.catalog$.pipe(switchMap(catalog => {
      const studyCase = catalog.cases[caseId];
      if (!studyCase) {
        return throwError(() => new FrozenStudyCaseIntegrityError(
          `Canonical Study case '${caseId}' is missing from catalog '${catalog.catalogVersion}'. Contact the study technical team.`
        ));
      }
      const cached = this.frozenCases.get(caseId);
      if (cached) {
        return cached;
      }
      const loaded = this.loadFrozenCase(caseId, studyCase, catalog.catalogVersion)
        .pipe(shareReplay(1));
      this.frozenCases.set(caseId, loaded);
      return loaded;
    }), catchError(error => throwError(() => error instanceof FrozenStudyCaseIntegrityError
      ? error
      : this.integrityError('Frozen Study catalog could not be loaded.', error))));
  }

  private loadFrozenCase(
    requestedCaseId: string,
    value: FrozenStudyCase,
    catalogVersion: string
  ): Observable<StudyCaseStimulus> {
    return from(Promise.resolve(value)).pipe(
      switchMap(value => {
        this.validateCase(value, requestedCaseId);
        const assetRequests = value.studyOnly ? [] : value.prediction.results.flatMap(result => {
          const assets = value.explanationAssets[result.disease];
          return [
            this.http.get(assets.beeswarmImage, {responseType: 'blob'}),
            this.http.get(assets.beeswarmData)
          ];
        });
        return forkJoin({
          hash: from(this.sha256(this.canonicalizeWithoutHash(value))),
          // RxJS forkJoin([]) completes without emitting. Target-only WP6
          // cases intentionally have no beeswarm assets, but must still
          // proceed through the same hash/schema validation path.
          assets: assetRequests.length ? forkJoin(assetRequests) : of([])
        }).pipe(map(({hash, assets}) => {
          if (hash !== value.contentHash) {
            throw new FrozenStudyCaseIntegrityError(
              `Frozen Study case '${requestedCaseId}' failed SHA-256 content validation.`
            );
          }
          const emptyImage = !value.studyOnly && assets.some((asset, index) => index % 2 === 0 && asset instanceof Blob && !asset.size);
          if (emptyImage) {
            throw new FrozenStudyCaseIntegrityError(
              `Frozen Study case '${requestedCaseId}' references an empty beeswarm image.`
            );
          }
          return {source: 'frozen', case: value, catalogVersion} as const;
        }));
      }),
      catchError(error => throwError(() => error instanceof FrozenStudyCaseIntegrityError
        ? error
        : this.integrityError(`Frozen Study case '${requestedCaseId}' could not be loaded.`, error)))
    );
  }

  private validateCatalog(value: FrozenStudyCaseCatalog): FrozenStudyCaseCatalog {
    if (!value || value.schemaVersion !== 1 || !value.catalogVersion || !value.cases
        || typeof value.cases !== 'object' || Array.isArray(value.cases)
        || !value.integrity || value.integrity.algorithm !== 'SHA-256'
        || value.integrity.caseCount !== Object.keys(value.cases).length
        || !this.isSha256(value.contentHash)) {
      throw new FrozenStudyCaseIntegrityError('Frozen Study catalog has an invalid schema.');
    }
    for (const [caseId, studyCase] of Object.entries(value.cases)) {
      if (!/^[AB][1-4]$/.test(caseId) || studyCase?.caseId !== caseId || !this.isSha256(studyCase?.contentHash)) {
        throw new FrozenStudyCaseIntegrityError(`Frozen Study catalog entry '${caseId}' is invalid.`);
      }
    }
    return value;
  }

  private validateCase(value: FrozenStudyCase, requestedCaseId: string): void {
    const definition = getStudyCaseDefinition(requestedCaseId);
    if (!value || value.schemaVersion !== 1 || value.caseId !== requestedCaseId
        || !definition || value.condition !== definition.block
        || value.matchedPairId !== definition.matchedPairId
        || !value.patientProfile || value.patientProfile.resourceType !== 'Patient'
        || !this.validPatientSummary(value.patientSummary)
        || !value.questionnaireAnswers || typeof value.questionnaireAnswers !== 'object'
        || Array.isArray(value.questionnaireAnswers)
        || !value.targetDisease || !value.prediction?.results?.length
        || !this.validAssessmentConfig(value)
        || !value.prediction?.resolved_stratum
        || !value.predictionSnapshot || !Array.isArray(value.predictionSnapshot.expectedDiseases)
        || !value.predictionSnapshot.expectedDiseases.length
        || value.predictionSnapshot.expectedDiseases.some(disease => typeof disease !== 'string' || !disease)
        || !['complete', 'development-partial'].includes(value.predictionSnapshot.status)
        || !value.predictionSnapshot.source
        || !value.explanationAssets || typeof value.explanationAssets !== 'object'
        || Array.isArray(value.explanationAssets)
        || !value.integrity || value.integrity.algorithm !== 'SHA-256'
        || !Number.isFinite(value.integrity.shapTolerance) || value.integrity.shapTolerance < 0
        || !Number.isFinite(value.integrity.maxReconstructionError)
        || value.integrity.maxReconstructionError > value.integrity.shapTolerance
        || !Array.isArray(value.integrity.mappingWarnings)
        || !this.isSha256(value.contentHash)) {
      throw new FrozenStudyCaseIntegrityError(`Frozen Study case '${requestedCaseId}' has an invalid schema or identity.`);
    }
    const diseases = value.prediction.results.map(result => result.disease);
    const expectedDiseases = value.predictionSnapshot.expectedDiseases;
    const diseaseSet = new Set(diseases);
    const expectedDiseaseSet = new Set(expectedDiseases);
    const completeDiseaseSetIsExact = diseases.length === expectedDiseases.length
      && diseaseSet.size === diseases.length
      && expectedDiseaseSet.size === expectedDiseases.length
      && expectedDiseases.every(disease => diseaseSet.has(disease));
    if (!diseases.includes(value.targetDisease) || diseaseSet.size !== diseases.length
        || expectedDiseaseSet.size !== expectedDiseases.length
        || diseases.some(disease => !expectedDiseaseSet.has(disease))
        || (value.predictionSnapshot.status === 'complete' && !completeDiseaseSetIsExact)) {
      throw new FrozenStudyCaseIntegrityError(`Frozen Study case '${requestedCaseId}' has inconsistent prediction data.`);
    }
    for (const result of value.prediction.results) {
      const waterfall = result.plots?.['waterfall']?.waterfall_data;
      const assets = value.explanationAssets[result.disease];
      const shapTable = result.local_shap_table;
      const studyRawScore: number = value.studyOnly ? (result.prediction.raw_score ?? NaN) : result.prediction.risk_score;
      const rawExpectedValue: number = value.studyOnly ? ((waterfall as any)?.raw_expected_value_log_odds ?? NaN) : NaN;
      const rawOtherContribution: number = value.studyOnly
        ? ((waterfall as any)?.raw_other_features_log_odds ?? NaN) : (waterfall?.other_features_contribution ?? NaN);
      const rawMargin = Number.isFinite(studyRawScore) && studyRawScore > 0 && studyRawScore < 1
        ? Math.log((studyRawScore as number) / (1 - (studyRawScore as number))) : NaN;
      const rawShapSum = Array.isArray(shapTable)
        ? shapTable.reduce((sum, item) => sum + item.shap_value, 0) : NaN;
      const displayedRawShapSum = waterfall
        ? [...waterfall.top_positive_contributors, ...waterfall.top_negative_contributors]
          .reduce((sum, item) => sum + item.shap_value, 0) : NaN;
      if (!result.disease || !Number.isFinite(result.prediction?.risk_score)
          || (value.studyOnly ? !Number.isFinite(studyRawScore) : Math.abs(result.prediction.risk_score - waterfall.final_prediction) > 1e-6)
          || !this.validWaterfall(waterfall)
          || !Array.isArray(shapTable) || !shapTable.length
          || shapTable.some(item => !item || typeof item.feature_name !== 'string'
            || !Number.isFinite(item.shap_value)
            || !['observed', 'estimated', 'unknown'].includes(item.provenance))
          || (value.studyOnly
            ? !Number.isFinite(rawExpectedValue) || !Number.isFinite(rawOtherContribution)
              || Math.abs(rawExpectedValue + rawShapSum - rawMargin) > value.integrity.shapTolerance
              || Math.abs(rawExpectedValue + displayedRawShapSum + rawOtherContribution - rawMargin) > value.integrity.shapTolerance
            : Math.abs(waterfall.baseline_value + rawShapSum - (studyRawScore as number)) > value.integrity.shapTolerance
              || Math.abs(waterfall.baseline_value + displayedRawShapSum
                + waterfall.other_features_contribution - waterfall.final_prediction) > value.integrity.shapTolerance)
          || (!value.studyOnly && (!assets?.beeswarmImage?.startsWith('assets/beeswarm/')
            || !assets?.beeswarmData?.startsWith('assets/beeswarm/')))) {
        throw new FrozenStudyCaseIntegrityError(
          `Frozen Study case '${requestedCaseId}' has incomplete data for disease '${result.disease}'.`
        );
      }
    }
  }

  private validWaterfall(value: WaterfallData): boolean {
    return Number.isFinite(value.baseline_value) && Number.isFinite(value.final_prediction)
      && Array.isArray(value.top_positive_contributors) && Array.isArray(value.top_negative_contributors)
      && [...value.top_positive_contributors, ...value.top_negative_contributors].every(contributor =>
        !!contributor && typeof contributor.feature_name === 'string'
        && typeof contributor.display_name === 'string' && typeof contributor.is_imputed === 'boolean'
        && Number.isFinite(contributor.shap_value))
      && Number.isFinite(value.other_features_contribution) && Number.isInteger(value.num_other_features);
  }

  private validAssessmentConfig(value: FrozenStudyCase): boolean {
    const config = value.assessmentConfig;
    const result = value.prediction?.results?.find(item => item.disease === value.targetDisease);
    const waterfall = result?.plots?.['waterfall']?.waterfall_data;
    if (!config || !waterfall) return false;

    const contributors = [...waterfall.top_positive_contributors, ...waterfall.top_negative_contributors];
    const featureName = (item: any): string => item.feature_name;
    const contributorNames = new Set(contributors.map(featureName));
    const featureConfigs = [config.p1, config.p2, config.p5, config.p6];
    if (featureConfigs.some(item => !item?.feature || !contributorNames.has(item.feature))) return false;
    if (config.p1.correctAnswer !== config.p1.feature || config.p2.correctAnswer !== config.p2.feature
      || config.p5.correctAnswer !== 'no'
      || !config.p1.options?.includes(config.p1.correctAnswer)
      || !config.p2.options?.includes(config.p2.correctAnswer)
      || !config.p1.options?.includes('Cannot tell from this chart')
      || !config.p2.options?.includes('Cannot tell from this chart')
      || config.p3.correctAnswer !== 'reference_model_output'
      || !['above', 'below', 'about_same'].includes(config.p4.correctAnswer)
      || !['measured', 'estimated'].includes(config.p6.correctAnswer)) return false;

    for (const question of [config.p1, config.p2]) {
      if (new Set(question.options ?? []).size !== question.options?.length
        || question.excludedFeatures?.some(feature => question.options?.includes(feature))
        || (question.optionLabels && question.options?.some(option => option !== 'Cannot tell from this chart'
          && typeof question.optionLabels?.[option] !== 'string'))) return false;
    }

    const positiveNames = waterfall.top_positive_contributors.map(featureName);
    const negativeNames = waterfall.top_negative_contributors.map(featureName);
    const expectedP5 = positiveNames.find((name: string, index: number) => index > 0 && name !== config.p1.feature)
      || positiveNames.find((name: string) => name !== config.p1.feature);
    const expectedP6 = contributors.find(item => typeof item.is_imputed === 'boolean'
      && !new Set([config.p1.feature, config.p2.feature, config.p5.feature]).has(featureName(item)))
      || contributors.find(item => typeof item.is_imputed === 'boolean');
    const expectedP4 = waterfall.final_prediction > waterfall.baseline_value
      ? 'above' : waterfall.final_prediction < waterfall.baseline_value ? 'below' : 'about_same';
    const rank = (item: FrozenStudyCase['assessmentConfig']['p1']): number => item.answerRank ?? 1;
    const expectedPositive = positiveNames[rank(config.p1) - 1];
    const expectedNegative = negativeNames[rank(config.p2) - 1];
    if (config.p1.feature !== expectedPositive || config.p2.feature !== expectedNegative
      || config.p5.feature !== expectedP5 || config.p4.correctAnswer !== expectedP4
      || !expectedP6 || config.p6.feature !== featureName(expectedP6)) return false;
    if (rank(config.p1) < 1 || rank(config.p1) > positiveNames.length
      || rank(config.p2) < 1 || rank(config.p2) > negativeNames.length) return false;
    const expectedP1Excluded = positiveNames.slice(0, rank(config.p1) - 1);
    const expectedP2Excluded = negativeNames.slice(0, rank(config.p2) - 1);
    if (JSON.stringify(config.p1.excludedFeatures ?? []) !== JSON.stringify(expectedP1Excluded)
      || JSON.stringify(config.p2.excludedFeatures ?? []) !== JSON.stringify(expectedP2Excluded)) return false;

    const p6 = contributors.find(item => featureName(item) === config.p6.feature);
    return typeof p6?.is_imputed === 'boolean'
      && config.p6.correctAnswer === (p6.is_imputed ? 'estimated' : 'measured');
  }

  private validPatientSummary(value: FrozenStudyCase['patientSummary']): boolean {
    if (!value || typeof value !== 'object') return false;
    const panels = [
      value.conditionItems,
      value.symptomItems,
      value.medicationItems,
      value.familyItems,
      value.labItems,
      value.vitalItems,
      value.lifestyleItems,
      value.surveyItems
    ];
    if (panels.some(items => !Array.isArray(items)
      || items.some(item => !item || typeof item.primary !== 'string'))) {
      return false;
    }
    return Array.isArray(value.historyEvents) && value.historyEvents.every(event =>
      !!event && typeof event.id === 'string' && typeof event.kind === 'string'
      && typeof event.subtype === 'string' && typeof event.title === 'string'
      && typeof event.date === 'string' && typeof event.iconKey === 'string');
  }

  private canonicalizeWithoutHash(value: FrozenStudyCase | FrozenStudyCaseCatalog): string {
    const {contentHash: _contentHash, ...payload} = value;
    return JSON.stringify(this.sortKeys(payload));
  }

  private sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => this.sortKeys(item));
    if (value && typeof value === 'object') {
      return Object.keys(value as object).sort().reduce<Record<string, unknown>>((result, key) => {
        result[key] = this.sortKeys((value as Record<string, unknown>)[key]);
        return result;
      }, {});
    }
    return value;
  }

  private async sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private isSha256(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value ?? '');
  }

  private integrityError(message: string, cause: unknown): FrozenStudyCaseIntegrityError {
    console.error(message, cause);
    return new FrozenStudyCaseIntegrityError(`${message} Contact the study technical team.`);
  }
}
