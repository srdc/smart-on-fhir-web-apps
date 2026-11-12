import {Component, Input, OnInit} from '@angular/core';
import {StudyBlockId, StudyParticipantProgress} from '../models/study-case-progress';
import {assignedCasePosition, studySection, StudySectionMetadata} from '../study-section.config';
import {StudyProgressService} from '../services/study-progress.service';
import {assignedBlockForCase, getStudyCaseDefinition} from '../study-sequence.config';

@Component({
  selector: 'app-study-case-progress-indicator',
  template: '<div class="study-case-progress text-muted small" aria-live="polite">{{ section.title }} · Case {{ caseNumber }} of {{ totalCases }}</div>',
  styles: ['.study-case-progress { margin-bottom: 1rem; }']
})
export class StudyCaseProgressIndicatorComponent implements OnInit {
  @Input() caseId = '';
  @Input() block: StudyBlockId | null = null;

  section: StudySectionMetadata = studySection('A');
  caseNumber = 1;
  totalCases = this.section.totalCases;

  constructor(private progressService: StudyProgressService) {}

  ngOnInit(): void {
    const update = (participant: StudyParticipantProgress | null) => {
      const block = assignedBlockForCase(participant, this.caseId) ?? this.block
        ?? getStudyCaseDefinition(this.caseId)?.block ?? 'A';
      this.block = block;
      this.section = studySection(block);
      const position = assignedCasePosition(participant, block, this.caseId);
      this.caseNumber = position.number;
      this.totalCases = position.total;
    };
    update(this.progressService.getParticipantProgress());
    this.progressService.initializeParticipant().subscribe({next: update});
  }
}
