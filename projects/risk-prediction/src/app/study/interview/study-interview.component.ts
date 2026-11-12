import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {StudyInterviewAnswers} from '../models/study-case-progress';
import {StudyProgressService} from '../services/study-progress.service';

interface InterviewQuestion {
  id: keyof StudyInterviewAnswers;
  text: string;
}

interface InterviewSection {
  heading: string;
  questions: InterviewQuestion[];
}

@Component({
  selector: 'app-study-interview',
  templateUrl: './study-interview.component.html',
  styleUrls: ['./study-interview.component.scss']
})
export class StudyInterviewComponent implements OnInit {
  readonly sections: InterviewSection[] = [
    {heading: 'A. How the LLM changed interpretation', questions: [
      {id: 'interpretation_change', text: 'Did the text explanations change how you interpreted the SHAP chart? If so, how?'},
      {id: 'chart_vs_text_use', text: 'Did the text reduce your need to interpret the chart directly, or did you keep using the chart alongside it?'}
    ]},
    {heading: 'B. Interactive explanation', questions: [
      {id: 'useful_suggested_questions', text: 'Which suggested questions were useful? Which were not?'},
      {id: 'missing_questions', text: 'Did you feel able to ask the questions you wanted to ask? Was anything missing?'}
    ]},
    {heading: 'C. Remaining limitations and possible misleading effects', questions: [
      {id: 'unclear_or_misleading', text: 'Was anything unclear, misleading or inconsistent with what you understood from the chart?'},
      {id: 'overcertainty_wording', text: 'Did the wording ever make the result seem more certain or convincing than the underlying explanation justified?'}
    ]},
    {heading: 'D. Clinical usefulness and boundaries', questions: [
      {id: 'clinical_improvements', text: 'What would you add or change to make these explanations more useful in practice?'},
      {id: 'inappropriate_information', text: 'Was there anything the system told you that you felt it should not provide?'},
      {id: 'adoption_factors', text: 'What would encourage or discourage you from using it in your clinical setting?'},
      {id: 'confidence_in_faithfulness', text: 'What would make you more or less confident that the explanation accurately represents the model output?'},
      {id: 'patient_explanation_usefulness', text: 'Would this system help you explain a prediction to a patient? Why or why not?'}
    ]}
  ];
  answers: StudyInterviewAnswers = {};
  loading = true;
  submitting = false;
  error: string | null = null;
  validationError = false;

  constructor(private progress: StudyProgressService, private router: Router) {}

  ngOnInit(): void {
    this.progress.loadInterviewAnswers().subscribe({
      next: answers => { this.answers = answers ?? {}; this.loading = false; },
      error: () => { this.error = 'The interview could not be loaded. Please try again.'; this.loading = false; }
    });
  }

  saveDraft(): void {
    if (this.loading || this.submitting) return;
    this.progress.saveInterviewDraft(this.answers).subscribe({error: () => {
      this.error = 'Your draft could not be saved. Please try again.';
    }});
  }

  submit(): void {
    this.validationError = this.sections.flatMap(section => section.questions)
      .some(question => !(this.answers[question.id] ?? '').trim());
    if (this.validationError) return;
    this.submitting = true;
    this.error = null;
    this.progress.submitInterview(this.answers).subscribe({
      next: destination => void this.router.navigate(destination, {replaceUrl: true}),
      error: error => {
        this.submitting = false;
        this.error = error?.error?.detail || 'The interview could not be submitted. Please try again.';
      }
    });
  }
}
