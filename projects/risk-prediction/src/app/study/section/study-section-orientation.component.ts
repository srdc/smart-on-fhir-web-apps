import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {StudyBlockId} from '../models/study-case-progress';
import {assignedCasePosition, studySection, StudySectionMetadata} from '../study-section.config';
import {StudyProgressService} from '../services/study-progress.service';

@Component({
  selector: 'app-study-section-orientation',
  templateUrl: './study-section-orientation.component.html',
  styleUrls: ['./study-section-orientation.component.scss']
})
export class StudySectionOrientationComponent implements OnInit {
  section: StudySectionMetadata = studySection('A');
  sectionId: StudyBlockId = 'A';
  caseNumber = 1;
  totalCases = this.section.totalCases;
  overview = false;
  readonly overviewText = 'You will complete two main sections, each containing '
    + `${studySection('A').totalCases} cases.`;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private progressService: StudyProgressService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('sectionId') as StudyBlockId | null;
    if (!id || !['A', 'B'].includes(id)) {
      this.error = 'Invalid study section.';
      return;
    }
    this.sectionId = id;
    this.section = studySection(id);
    this.overview = id === 'A';
    this.progressService.initializeParticipant().subscribe({
      next: participant => {
        if (!participant.backgroundCompleted) {
          void this.router.navigate(['/study/background'], {replaceUrl: true});
          return;
        }
        const position = assignedCasePosition(participant, id, participant.currentCaseId ?? '');
        this.caseNumber = position.number;
        this.totalCases = position.total;
      },
      error: error => this.error = error instanceof Error ? error.message : 'Study progress could not be loaded.'
    });
  }

  start(): void {
    this.progressService.markSectionOrientationSeen(this.sectionId);
    this.progressService.resolveAuthenticatedEntryDestination().subscribe({
      next: destination => this.router.navigate(destination, {replaceUrl: true}),
      error: error => this.error = error instanceof Error ? error.message : 'Study case could not be opened.'
    });
  }
}
