import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {StudyBlockId} from '../models/study-case-progress';
import {StudyProgressService} from '../services/study-progress.service';
import {getStudyCaseDefinition} from '../study-sequence.config';
import {StudyCaseStimulusService} from '../services/study-case-stimulus.service';
import {FrozenStudyCase} from '../models/frozen-study-case';

@Component({
  selector: 'app-study-case-inspection',
  templateUrl: './study-case-inspection.component.html',
  styleUrls: ['./study-case-inspection.component.scss']
})
export class StudyCaseInspectionComponent implements OnInit, OnDestroy {
  caseId: string | null = null;
  studyCondition: StudyBlockId | null = null;
  error: string | null = null;
  frozenCase: FrozenStudyCase | null = null;
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private progressService: StudyProgressService,
    private stimuli: StudyCaseStimulusService
  ) {}

  ngOnInit(): void {
    this.caseId = this.route.snapshot.paramMap.get('caseId')
      ?? this.route.snapshot.data['studyCaseId'];
    const caseDefinition = this.caseId
      ? getStudyCaseDefinition(this.caseId)
      : undefined;
    if (!this.caseId || !caseDefinition) {
      this.error = 'Invalid or unavailable study case.';
      this.loading = false;
      return;
    }
    this.progressService.loadCase(this.caseId).subscribe({
      next: caseProgress => this.stimuli.getCase(this.caseId!).subscribe({
        next: stimulus => {
          this.frozenCase = stimulus.case;
          // The persisted case block is the participant's experimental
          // condition. The frozen case's A/B label identifies its patient set.
          this.studyCondition = caseProgress.block;
          this.loading = false;
          try {
            this.progressService.enterPhase(this.caseId!, 'inspection');
          } catch (error) {
            this.error = this.progressService.participantFacingError(error, 'Study inspection');
          }
        },
        error: error => {
          this.loading = false;
          this.error = error instanceof Error
            ? error.message
            : 'The Study case catalog could not be loaded. Contact the study technical team.';
        }
      }),
      error: error => {
        this.loading = false;
        this.error = this.progressService.participantFacingError(error, 'Study inspection');
      }
    });
  }

  ngOnDestroy(): void {
    this.progressService.leavePhase();
  }

  continueToQuestions(): void {
    if (!this.caseId || this.error) {
      return;
    }

    this.progressService.beginAssessment(this.caseId).subscribe({
      next: () => this.router.navigate(
        ['/study/cases', this.caseId, 'assessment'],
        {replaceUrl: true}
      ),
      error: error => this.error = this.progressService.participantFacingError(error, 'Assessment transition')
    });
  }
}
