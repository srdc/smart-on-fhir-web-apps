import {CommonModule} from '@angular/common';
import {Component, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {ResearcherApiService, ResearchParticipantDetail, ResearchCase, ResearchPostBlock, ResearchAssessmentScore, ResearchInteraction, ResearchInteractionReview, ResearchInitialExplanation} from './researcher-api.service';
import {ResearcherAuthService} from './researcher-auth.service';
import {StudyCaseStimulusService} from '../study/services/study-case-stimulus.service';


interface DiseaseInteractionGroup {
  disease: string;
  interactions: ResearchInteraction[];
  suggestedInteractions: ResearchInteraction[];
  freeTextInteractions: ResearchInteraction[];
}

interface CaseInteractionGroups {
  primaryInteractions: ResearchInteraction[];
  primarySuggestedInteractions: ResearchInteraction[];
  primaryFreeTextInteractions: ResearchInteraction[];
  otherDiseaseGroups: DiseaseInteractionGroup[];
  totalOtherDiseaseInteractions: number;
  unknownDiseaseInteractions: ResearchInteraction[];
}

@Component({
  selector: 'app-research-participant',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './research-participant.component.html'
})
export class ResearchParticipantComponent implements OnInit {
  participant: ResearchParticipantDetail | null = null;
  loading = true;
  notFound = false;
  error: string | null = null;
  exportError: string | null = null;
  reviewStatus: Record<number, string> = {};
  readonly casesByBlock: Record<'A' | 'B', ResearchCase[]> = {A: [], B: []};
  interactionGroupsByCaseId: Record<string, CaseInteractionGroups> = {};
  initialExplanationsByCaseId: Record<string, ResearchInitialExplanation[]> = {};
  assessmentOptionLabels: Record<string, Record<string, Record<string, string>>> = {};

  constructor(
    private route: ActivatedRoute,
    private api: ResearcherApiService,
    public auth: ResearcherAuthService,
    private router: Router,
    private stimuli: StudyCaseStimulusService
  ) {}

  ngOnInit(): void {
    const participantId = this.route.snapshot.paramMap.get('participantId');
    if (!participantId) { this.notFound = true; this.loading = false; return; }
    this.api.getParticipant(participantId).subscribe({
      next: value => { this.setParticipant(value); this.loading = false; },
      error: error => {
        this.loading = false;
        this.notFound = error?.status === 404;
        this.error = this.notFound ? null : 'The researcher service is unavailable. Try again.';
      }
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/research/login'], {replaceUrl: true});
  }

  exportClinician(): void {
    if (!this.participant) return;
    this.exportError = null;
    this.api.exportParticipant(this.participant.participantId).subscribe({
      next: workbook => {
        const url = URL.createObjectURL(workbook);
        const link = document.createElement('a');
        link.href = url;
        link.download = `clinician-study-${this.participant?.participantId}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.exportError = 'The clinician export could not be downloaded. Try again.'
    });
  }

  duration(milliseconds: number): string {
    const seconds = milliseconds / 1000;
    return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
  }

  private setParticipant(participant: ResearchParticipantDetail): void {
    this.participant = participant;
    const sortedCases = [...participant.cases]
      .sort((left, right) => left.presentationPosition - right.presentationPosition);
    sortedCases.forEach(caseItem => {
      this.stimuli.getCase(caseItem.caseId).subscribe({
        next: stimulus => {
          const config = stimulus.case.assessmentConfig;
    
          this.assessmentOptionLabels[caseItem.caseId] = {
            p1: config.p1.optionLabels ?? {},
            p2: config.p2.optionLabels ?? {}
          };
        },
        error: error => {
          console.error(`Could not load assessment labels for ${caseItem.caseId}`, error);
        }
      });
    });    
    this.casesByBlock.A = sortedCases.filter(item => item.block === 'A');
    this.casesByBlock.B = sortedCases.filter(item => item.block === 'B');

    const interactionsByCaseId = new Map<string, ResearchInteraction[]>();
    [...participant.interactions]
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .forEach(item => {
        const interactions = interactionsByCaseId.get(item.caseId) ?? [];
        interactions.push(item);
        interactionsByCaseId.set(item.caseId, interactions);
        this.reviewFor(item);
      });

    const groupsByCaseId: Record<string, CaseInteractionGroups> = {};
    sortedCases.forEach(caseItem => {
      const primaryInteractions: ResearchInteraction[] = [];
      const unknownDiseaseInteractions: ResearchInteraction[] = [];
      const otherInteractionsByDisease = new Map<string, ResearchInteraction[]>();

      (interactionsByCaseId.get(caseItem.caseId) ?? []).forEach(item => {
        if (!this.hasRecordedInteractionDisease(item)) {
          unknownDiseaseInteractions.push(item);
        } else if (item.interactionDisease === caseItem.primaryStudyDisease) {
          primaryInteractions.push(item);
        } else {
          const diseaseInteractions = otherInteractionsByDisease.get(item.interactionDisease) ?? [];
          diseaseInteractions.push(item);
          otherInteractionsByDisease.set(item.interactionDisease, diseaseInteractions);
        }
      });

      const otherDiseaseGroups = Array.from(otherInteractionsByDisease, ([disease, interactions]) => ({
        disease,
        interactions,
        suggestedInteractions: interactions.filter(item => item.questionSource === 'suggested'),
        freeTextInteractions: interactions.filter(item => item.questionSource === 'free_text')
      }));
      groupsByCaseId[caseItem.caseId] = {
        primaryInteractions,
        primarySuggestedInteractions: primaryInteractions.filter(item => item.questionSource === 'suggested'),
        primaryFreeTextInteractions: primaryInteractions.filter(item => item.questionSource === 'free_text'),
        otherDiseaseGroups,
        totalOtherDiseaseInteractions: otherDiseaseGroups.reduce((total, group) => total + group.interactions.length, 0),
        unknownDiseaseInteractions
      };
    });
    this.interactionGroupsByCaseId = groupsByCaseId;
    this.initialExplanationsByCaseId = (participant.initialExplanations ?? []).reduce(
      (groups, item) => {
        (groups[item.caseId] ??= []).push(item);
        return groups;
      }, {} as Record<string, ResearchInitialExplanation[]>
    );
  }

  private hasRecordedInteractionDisease(interaction: ResearchInteraction): boolean {
    const disease = interaction.interactionDisease?.trim();
    return Boolean(disease && disease.toLowerCase() !== 'not recorded');
  }

  trackCase(_: number, caseItem: ResearchCase): string { return caseItem.caseId; }

  trackInteraction(_: number, interaction: ResearchInteraction): number { return interaction.interactionId; }
  trackInitialExplanation(_: number, explanation: ResearchInitialExplanation): string {
    return `${explanation.disease}:${explanation.chartType}`;
  }

  trackDiseaseGroup(_: number, group: DiseaseInteractionGroup): string { return group.disease; }

  totalRecorded(caseItem: ResearchCase): number {
    return caseItem.inspectionDurationMs + caseItem.evaluationDurationMs;
  }

  blockComplete(block: 'A' | 'B'): boolean {
    const cases = this.casesByBlock[block];
    return cases.length === 4 && cases.every(item => item.status === 'completed');
  }

  explanationContext(interaction: ResearchInteraction): string {
    if (interaction.chartType === 'waterfall') return 'Patient-Specific Feature Impact';
    if (interaction.chartType === 'beeswarm') return 'Global Feature Impact';
    return 'Not recorded';
  }

  stageLabel(participant: ResearchParticipantDetail): string {
    if (!participant.backgroundCompleted) return 'Background / Introduction';
    return ({
      A: 'Charts only', POST_A: 'Post Charts only',
      B: 'Charts + LLM', POST_B: 'Post Charts + LLM',
      COMPARE_ORIENTATION: 'Direct comparison', COMPARE: 'Direct comparison',
      INTERVIEW: 'Semi-Structured Interview', COMPLETE: 'Complete'
    } as Record<string, string>)[participant.currentStage] ?? participant.currentStage;
  }

  reviewFor(interaction: ResearchInteraction): any {
    return interaction.review ??= {
      intentCategory: null,
      diagnosisAdviceAbsent: null,
      treatmentAdviceAbsent: null,
      unsupportedCausalClaimAbsent: null,
      estimatedImputedValuesCommunicatedCorrectly: null
    };
  }

  canReview(interaction: ResearchInteraction): boolean {
    return interaction.questionSource === 'free_text'
      && interaction.interactionDisease === interaction.primaryStudyDisease;
  }

  saveReview(interaction: ResearchInteraction): void {
    if (!this.participant) return;
    this.reviewStatus[interaction.interactionId] = 'Saving…';
    this.api.saveInteractionReview(this.participant.participantId, interaction.interactionId, this.reviewFor(interaction))
      .subscribe({
        next: saved => {
          interaction.review = saved;
          this.reviewStatus[interaction.interactionId] = 'Saved';
        },
        error: () => this.reviewStatus[interaction.interactionId] = 'Could not save'
      });
  }

  readonly intentCategories = [
    'comprehension', 'causal', 'diagnostic', 'treatment-seeking',
    'counterfactual', 'prognostic', 'data-provenance', 'out-of-scope'
  ];

  answer(caseItem: ResearchCase, key: string): string {
    const value = caseItem.assessmentAnswers[key];
    return value === undefined || value === null || value === '' ? '—' : String(value);
  }

  score(caseItem: ResearchCase, id: string): ResearchAssessmentScore | undefined {
    return caseItem.assessmentScoring?.find(item => item.questionId === id);
  }

  isNotApplicable(caseItem: ResearchCase, id: string): boolean {
    return id === 'p3' && caseItem.p3Applicable === false;
  }

  scoreAnswer(value: unknown): string {
    return value === undefined || value === null || value === '' ? '—' : String(value);
  }

  assessmentAnswerLabel(caseId: string, id: string, value: unknown): string {
    if ((id === 'p1' || id === 'p2') && value != null) {
      const displayName = this.assessmentOptionLabels[caseId]?.[id]?.[String(value)];
  
      if (displayName) {
        return displayName;
      }
    }
  
    const labels: Record<string, Record<string, string>> = {
      p3: {reference_model_output: 'A model reference value', patient_previous_risk: "The patient's previous risk", population_prevalence: 'Population prevalence', cannot_tell: 'Cannot tell from this chart'},
      p4: {above: 'Above', below: 'Below', about_same: 'About the same', cannot_tell: 'Cannot tell from this chart'},
      p5: {yes: 'Yes', no: 'No', cannot_tell: 'Cannot tell'}
    };
  
    return labels[id]?.[String(value)] ?? this.scoreAnswer(value);
  }

  statusLabel(status: string | undefined): string {
    return status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Incorrect' : status === 'unanswered' ? 'Unanswered' : 'Not scored';
  }

  readonly assessmentLabels: Record<string, string> = {
    p1: 'Largest upward factor',
    p2: 'Largest downward factor',
    p3: 'Meaning of the baseline',
    p4: 'Predicted risk compared with baseline',
    p5: 'Whether the named feature causes increased risk',
    p6: 'Whether the named feature was measured or estimated'
  };

  readonly nasaLabels: Record<string, string> = {
    mentalDemand: 'Mental Demand', physicalDemand: 'Physical Demand', temporalDemand: 'Temporal Demand',
    performance: 'Performance', effort: 'Effort', frustration: 'Frustration'
  };

  readonly susLabels: Record<string, string> = {
    q1: 'I think that I would like to use this system frequently.',
    q2: 'I found the system unnecessarily complex.',
    q3: 'I thought the system was easy to use.',
    q4: 'I think that I would need the support of a technical person to be able to use this system.',
    q5: 'I found the various functions in this system were well integrated.',
    q6: 'I thought there was too much inconsistency in this system.',
    q7: 'I would imagine that most people would learn to use this system very quickly.',
    q8: 'I found the system very cumbersome to use.', q9: 'I felt very confident using the system.',
    q10: 'I needed to learn a lot of things before I could get going with this system.'
  };

  readonly comparisonLabels: Record<string, string> = {
    understandingPreference: 'Easier to understand',
    clinicalPracticePreference: 'Clinical practice preference',
    llmAddedValue: 'LLM added information',
    llmChartMatch: 'Doubted chart match',
    llmChartMatchDescription: 'Chart-match description',
    patientExplanationHelp: 'Patient explanation help',
    patientExplanationWhy: 'Patient explanation reason'
  };

  readonly interviewSections = [
    {heading: 'A. How the LLM changed interpretation', questions: [
      ['interpretation_change', 'Did the text explanations change how you interpreted the SHAP chart? If so, how?'],
      ['chart_vs_text_use', 'Did the text reduce your need to interpret the chart directly, or did you keep using the chart alongside it?']
    ]},
    {heading: 'B. Interactive explanation', questions: [
      ['useful_suggested_questions', 'Which suggested questions were useful? Which were not?'],
      ['missing_questions', 'Did you feel able to ask the questions you wanted to ask? Was anything missing?']
    ]},
    {heading: 'C. Remaining limitations and possible misleading effects', questions: [
      ['unclear_or_misleading', 'Was anything unclear, misleading or inconsistent with what you understood from the chart?'],
      ['overcertainty_wording', 'Did the wording ever make the result seem more certain or convincing than the underlying explanation justified?']
    ]},
    {heading: 'D. Clinical usefulness and boundaries', questions: [
      ['clinical_improvements', 'What would you add or change to make these explanations more useful in practice?'],
      ['inappropriate_information', 'Was there anything the system told you that you felt it should not provide?'],
      ['adoption_factors', 'What would encourage or discourage you from using it in your clinical setting?'],
      ['confidence_in_faithfulness', 'What would make you more or less confident that the explanation accurately represents the model output?'],
      ['patient_explanation_usefulness', 'Would this system help you explain a prediction to a patient? Why or why not?']
    ]}
  ];

  readonly backgroundLabels: Record<string, string> = {
    ageRange: 'Age range', gender: 'Gender', primarySpecialty: 'Primary specialty',
    yearsSinceQualification: 'Years since qualification', currentRole: 'Current role',
    currentRoleOther: 'Role specification', directPatientCareProportion: 'Direct patient care proportion',
    mlRiskPredictionFamiliarity: 'ML risk prediction familiarity', llmFamiliarity: 'LLM familiarity',
    priorAiDecisionSupport: 'Prior AI decision-support use', priorShapExposure: 'Prior SHAP exposure',
    clinicalRiskCalculatorFrequency: 'Clinical risk calculator frequency'
  };

  backgroundValue(key: string, value: unknown): string {
    const labels: Record<string, Record<string, string>> = {
      ageRange: {age_25_34: '25–34', age_35_44: '35–44', age_45_54: '45–54', age_55_plus: '55+'},
      gender: {female: 'Female', male: 'Male', other: 'Other', prefer_not_to_say: 'Prefer not to say'},
      currentRole: {resident_trainee: 'Resident or trainee', specialist: 'Specialist', consultant_attending: 'Consultant or attending', other: 'Other'},
      directPatientCareProportion: {less_than_25: '<25%', '25_50': '25–50%', '50_75': '50–75%', more_than_75: '>75%'},
      priorAiDecisionSupport: {yes: 'Yes', no: 'No'}, priorShapExposure: {yes: 'Yes', no: 'No', unsure: 'Unsure'},
      clinicalRiskCalculatorFrequency: {daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', rarely: 'Rarely', never: 'Never'}
    };
    return labels[key]?.[String(value)] ?? (value === undefined || value === null || value === '' ? '—' : String(value));
  }

  perceivedLabel(block: string, key: string): string {
    const subject = block === 'A' ? 'chart' : 'explanation';
    const labels: Record<string, string> = {
      q1: `The ${subject} was clear and easy to understand.`,
      q2: `The ${subject} helped me understand why the model produced this prediction.`,
      q3: `The ${subject} provided the information I needed to interpret the prediction.`,
      q4: 'The level of detail was appropriate.',
      q5: `The ${subject} helped me identify the most important factors influencing the prediction.`,
      q6: 'I had to work out things for myself that it should have made clear.',
      q7: `I believe the ${subject} reflects what actually drove the model's output.`,
      q8: `I suspect the ${subject} leaves out things that mattered to the prediction.`,
      q9: `I feel confident that I understood the ${subject} correctly.`
    };
    return labels[key] ?? key;
  }

  postValue(post: ResearchPostBlock | null, group: 'nasaRtlx' | 'sus' | 'perceivedExplanationQuality', key: string): string {
    const value = post?.[group]?.[key];
    return value === undefined ? '—' : String(value);
  }
}
