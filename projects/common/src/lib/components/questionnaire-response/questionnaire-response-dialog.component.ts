import {Component, EventEmitter, HostListener, Input, OnChanges, Output} from '@angular/core';

/** A question (or group) of the response, flattened with its nesting depth */
export interface QuestionnaireResponseRow {
  depth: number;
  text: string;
  /** Formatted answers; empty for groups and unanswered questions */
  answers: string[];
  group: boolean;
}

/**
 * Dialog showing the answers of a QuestionnaireResponse. Question texts are taken from the response, else from the
 * questionnaire (when given), else the item's linkId; coded answers are shown with their display.
 *
 * Render it with *ngIf and remove it on (closed).
 */
@Component({
  selector: 'app-questionnaire-response-dialog',
  templateUrl: './questionnaire-response-dialog.component.html',
  styleUrls: ['./questionnaire-response-dialog.component.scss']
})
export class QuestionnaireResponseDialogComponent implements OnChanges {

  @Input({required: true}) response!: fhir4.QuestionnaireResponse;
  /** The questionnaire answered, for question texts and answer option displays missing in the response */
  @Input() questionnaire?: fhir4.Questionnaire;
  @Input() title?: string;
  @Output() closed = new EventEmitter<void>();

  rows: QuestionnaireResponseRow[] = [];
  private questions = new Map<string, fhir4.QuestionnaireItem>();

  ngOnChanges(): void {
    this.questions.clear();
    this.indexQuestions(this.questionnaire?.item);
    this.rows = [];
    this.addRows(this.response?.item, 0);
  }

  get dialogTitle(): string {
    return this.title || this.questionnaire?.title || this.questionnaire?.name || 'Questionnaire response';
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }

  private indexQuestions(items?: fhir4.QuestionnaireItem[]): void {
    for (const item of items || []) {
      this.questions.set(item.linkId, item);
      this.indexQuestions(item.item);
    }
  }

  private addRows(items: fhir4.QuestionnaireResponseItem[] | undefined, depth: number): void {
    for (const item of items || []) {
      const question = this.questions.get(item.linkId);
      const answers = (item.answer || []).map(answer => this.formatAnswer(answer, question))
        .filter(answer => answer !== '');
      const group = !item.answer?.length && !!item.item?.length;
      this.rows.push({depth, text: item.text || question?.text || item.linkId, answers, group});
      this.addRows(item.item, depth + 1);
      // questions nested under an answer
      (item.answer || []).forEach(answer => this.addRows(answer.item, depth + 1));
    }
  }

  private formatAnswer(answer: fhir4.QuestionnaireResponseItemAnswer, question?: fhir4.QuestionnaireItem): string {
    if (answer.valueBoolean !== undefined) {
      return answer.valueBoolean ? 'Yes' : 'No';
    }
    if (answer.valueCoding) {
      const coding = answer.valueCoding;
      return coding.display
        || question?.answerOption?.find(option => option.valueCoding?.code === coding.code
          && (!coding.system || !option.valueCoding?.system || option.valueCoding.system === coding.system))
          ?.valueCoding?.display
        || coding.code || '';
    }
    if (answer.valueQuantity) {
      const quantity = answer.valueQuantity;
      return [quantity.comparator, quantity.value, quantity.unit || quantity.code].filter(v => v !== undefined).join(' ');
    }
    if (answer.valueDecimal !== undefined) return String(answer.valueDecimal);
    if (answer.valueInteger !== undefined) return String(answer.valueInteger);
    if (answer.valueDate) return answer.valueDate;
    if (answer.valueDateTime) return this.formatDateTime(answer.valueDateTime);
    if (answer.valueTime) return answer.valueTime;
    if (answer.valueString !== undefined) return answer.valueString;
    if (answer.valueUri) return answer.valueUri;
    if (answer.valueAttachment) return answer.valueAttachment.title || answer.valueAttachment.url || 'Attachment';
    if (answer.valueReference) return answer.valueReference.display || answer.valueReference.reference || '';
    return '';
  }

  private formatDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
