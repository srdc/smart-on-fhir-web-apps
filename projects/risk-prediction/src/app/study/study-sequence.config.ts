import {StudyAssignedCaseOrder, StudyBlockId, StudyParticipantProgress} from './models/study-case-progress';

export interface StudyCaseDefinition {
  caseId: string;
  block: StudyBlockId;
  matchedPairId?: string;
}

export const STUDY_CASE_DEFINITIONS: readonly StudyCaseDefinition[] = [
  {caseId: 'A1', block: 'A', matchedPairId: 'pair_1'},
  {caseId: 'A2', block: 'A', matchedPairId: 'pair_2'},
  {caseId: 'A3', block: 'A', matchedPairId: 'pair_3'},
  {caseId: 'A4', block: 'A', matchedPairId: 'pair_4'},
  {caseId: 'B1', block: 'B', matchedPairId: 'pair_1'},
  {caseId: 'B2', block: 'B', matchedPairId: 'pair_2'},
  {caseId: 'B3', block: 'B', matchedPairId: 'pair_3'},
  {caseId: 'B4', block: 'B', matchedPairId: 'pair_4'}
];

export const DEFAULT_ASSIGNED_CASE_ORDER: Readonly<StudyAssignedCaseOrder> = {
  A: ['A1', 'A2', 'A3', 'A4'],
  B: ['B1', 'B2', 'B3', 'B4']
};

export function getStudyCaseDefinition(caseId: string): StudyCaseDefinition | undefined {
  return STUDY_CASE_DEFINITIONS.find(definition => definition.caseId === caseId);
}

export function getCanonicalCaseIds(block: StudyBlockId): string[] {
  return STUDY_CASE_DEFINITIONS
    .filter(definition => definition.block === block)
    .map(definition => definition.caseId);
}

/** Experimental condition is assigned per participant, never inferred from a case ID. */
export function assignedBlockForCase(
  participant: StudyParticipantProgress | null,
  caseId: string
): StudyBlockId | null {
  for (const block of ['A', 'B'] as const) {
    if ((participant?.assignedCaseOrder?.[block] ?? []).includes(caseId)) {
      return block;
    }
  }
  return null;
}
