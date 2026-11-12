import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';

@Component({
  selector: 'rp-question',
  templateUrl: './question.component.html',
  styleUrl: './question.component.scss'
})
export class QuestionComponent {
  @Input() q: any;                    // Questionnaire item
  @Input() answers: any = {};         // Full answer object from parent form
  @Input() isPrefilled: boolean = false;  // NEW: Is this answer pre-filled?
  @Input() readonly: boolean = false;
  @Output() answerChanged = new EventEmitter<{ linkId: string, value: any }>();

  enabled = true;

  isExclusiveOption(code: string): boolean {
    return !isNaN(Number(code)) && Number(code) < 0;
  }

  //checkbox
  toggleOption(optionCode: string, isExclusive: boolean) {
    if (this.readonly) return;
    console.log("toggleOption:", optionCode, "exclusive:", isExclusive);

    // Single-answer question (non-repeating)
    if (!this.q.repeats) {
      this.answerChanged.emit({ linkId: this.q.linkId, value: optionCode });
      return;
    }

    let current = this.answers[this.q.linkId] ?? [];

    // If user clicks an exclusive option → override all
    if (isExclusive) {
      current = [optionCode];
    } else {
      // Remove exclusive answers
      current = current.filter((c: string) => !this.isExclusiveOption(c));

      // Toggle this option
      if (current.includes(optionCode)) {
        current = current.filter((c: string) => c !== optionCode);
      } else {
        current.push(optionCode);
      }
    }

    this.answerChanged.emit({ linkId: this.q.linkId, value: current });
  }

  isChecked(code: any) {
    const a = this.answers[this.q.linkId];
    if (a === undefined || a === null) return false;
    return Array.isArray(a)
      ? a.some((x: any) => String(x) === String(code))
      : String(a) === String(code);
  }

  //numeric input
  onNumericChange(value: any) {
    if (this.readonly) return;
    const num = value === '' ? null : Number(value);
    this.answerChanged.emit({ linkId: this.q.linkId, value: num });
  }

  displayNumericValue(): string | number {
    const value = this.answers[this.q.linkId];
    if (!this.readonly || value === undefined || value === null || value === '') return value ?? '';

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value;
    const precision: Record<string, number> = {
      '21003': 0,
      '21001': 2,
      '50': 1,
      '48': 1,
      '49': 1,
      'sbp': 1,
      'dbp': 1,
      '23099': 1,
      '1160': 1
    };
    return numeric.toFixed(precision[this.q.linkId] ?? 2);
  }

}
