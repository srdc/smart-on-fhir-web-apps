import {StudyAssignedCaseOrder, StudyBlockId, StudyParticipantProgress} from './models/study-case-progress';

export interface StudySectionMetadata {
  id: StudyBlockId;
  title: string;
  description: string;
  totalCases: number;
}

export const STUDY_SECTION_METADATA: Readonly<Record<StudyBlockId, StudySectionMetadata>> = {
  A: {
    id: 'A',
    title: 'Charts only',
    description: 'In this section, you will review 4 cases using chart-based model explanations.',
    totalCases: 4
  },
  B: {
    id: 'B',
    title: 'Charts + LLM',
    description: 'In this section, you will review 4 cases using chart-based model explanations together with LLM-generated explanations and question support.',
    totalCases: 4
  }
};

export function studySection(block: StudyBlockId): StudySectionMetadata {
  return STUDY_SECTION_METADATA[block];
}

export function assignedCasePosition(
  participant: StudyParticipantProgress | null,
  block: StudyBlockId,
  caseId: string
): {number: number; total: number} {
  const order = participant?.assignedCaseOrder?.[block as keyof StudyAssignedCaseOrder] ?? [];
  const index = order.indexOf(caseId);
  return {
    number: index >= 0 ? index + 1 : 1,
    total: order.length || studySection(block).totalCases
  };
}
