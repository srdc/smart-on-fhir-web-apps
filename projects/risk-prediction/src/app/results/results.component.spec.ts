import { ResultsComponent } from './results.component';
import catalog from '../../assets/study/study_cases.json';

describe('ResultsComponent', () => {
  function createComponent(): ResultsComponent {
    return new ResultsComponent(
      jasmine.createSpyObj('Router', ['navigate']), {} as any, {} as any, {} as any, {menuItems: []} as any
    );
  }

  it('should create', () => {
    const component = createComponent();
    expect(component).toBeTruthy();
  });

  it('shows the shared static explanation in both study conditions only', () => {
    const component = createComponent();

    expect(component.showStudyStaticExplanation).toBeFalse();

    component.studyConditionOverride = 'A';
    expect(component.showStudyStaticExplanation).toBeTrue();

    component.studyConditionOverride = 'B';
    expect(component.showStudyStaticExplanation).toBeTrue();
  });

  it('enables chatbots for normal Risk Prediction and Study Block B, but not Block A', () => {
    const component = createComponent();

    expect(component.chatbotsEnabled).toBeTrue();

    component.studyConditionOverride = 'A';
    expect(component.chatbotsEnabled).toBeFalse();

    component.studyConditionOverride = 'B';
    expect(component.chatbotsEnabled).toBeTrue();
  });

  it('feeds every frozen WP6 prediction to the radar chart and disease cards', () => {
    const component = createComponent();
    component.frozenStudyCase = catalog.cases.A1 as any;

    component.ngOnInit();

    expect(component.diseases.length).toBe(catalog.cases.A1.prediction.results.length);
    expect(component.chartData?.labels).toEqual(component.diseases.map(disease => disease.disease));
    expect(component.waterfallChartData['Stroke Cerebrovascular']).toBeTruthy();
    expect(component.diseases.some(disease => disease.disease === catalog.cases.A1.targetDisease)).toBeTrue();
  });

  it('formats clinical values for display without changing the source value', () => {
    const component = createComponent();
    const feature = catalog.cases.A1.prediction.results
      .find(result => result.disease === catalog.cases.A1.targetDisease)!
      .plots['waterfall'].waterfall_data.top_positive_contributors[0];
    const raw = feature.feature_value;

    expect(component.formatWaterfallFeatureValue({...feature, name: feature.display_name, value: feature.shap_value})).toBe('70');
    expect(feature.feature_value).toBe(raw);
    expect(component.formatPercent(0.0671914959708525)).toBe('6.72%');
  });

  it('uses probability fractions for every WP6 target waterfall coordinate', () => {
    Object.entries(catalog.cases).forEach(([caseId, frozenCase]) => {
      const component = createComponent();
      component.frozenStudyCase = frozenCase as any;
      component.ngOnInit();

      const targetResult = frozenCase.prediction.results
        .find(result => result.disease === frozenCase.targetDisease)!;
      const sourceWaterfall = targetResult.plots.waterfall.waterfall_data;
      const dataset = component.waterfallChartData[frozenCase.targetDisease].datasets[0] as any;
      const coordinates = dataset.data as Array<[number, number]>;
      const finalCoordinate = coordinates[coordinates.length - 1][1];

      expect(dataset.baselineValue).withContext(`${caseId} baseline`).toBeCloseTo(sourceWaterfall.baseline_value, 12);
      expect(finalCoordinate).withContext(`${caseId} final raw prediction`).toBeCloseTo(sourceWaterfall.final_prediction, 12);
      expect(Math.max(...coordinates.flat())).withContext(`${caseId} coordinates remain probabilities`).toBeLessThan(1);

      const sourceFeatures = [
        ...sourceWaterfall.top_positive_contributors,
        ...sourceWaterfall.top_negative_contributors
      ];
      sourceFeatures.forEach(feature => {
        const index = dataset.features.findIndex((entry: any) => entry?.display_name === feature.display_name);
        expect(dataset.contributions[index]).withContext(`${caseId} ${feature.display_name}`).toBeCloseTo(
          feature.display_contribution / 100,
          12
        );
      });
    });
  });

  it('shows A1 waterfall normalized risk contribution without raw SHAP or feature value', () => {
    const component = createComponent();
    component.frozenStudyCase = catalog.cases.A1 as any;
    component.ngOnInit();

    const chart = component.waterfallChartData['Stroke Cerebrovascular'];
    const dataset = chart.datasets[0] as any;
    const ageIndex = (chart.labels as string[]).indexOf('Age');
    const tooltip = (component.waterfallChartOptions as any).plugins.tooltip.callbacks;
    const lines = tooltip.label({dataset, dataIndex: ageIndex});

    expect(dataset.baselineValue).toBeCloseTo(0.03934450781557908, 12);
    expect(dataset.contributions[ageIndex]).toBeCloseTo(0.01837282443136279, 12);
    expect(dataset.data[dataset.data.length - 1][1]).toBeCloseTo(0.06719830215317683, 12);
    expect(lines).toEqual(['Risk contribution: +1.837 percentage points']);
    expect(lines.join(' ')).not.toContain('Feature value:');
    expect(lines.join(' ')).not.toContain('SHAP value:');
  });
});
