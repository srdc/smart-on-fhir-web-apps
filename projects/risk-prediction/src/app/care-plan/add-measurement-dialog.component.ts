import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {GoalMeasurement, GoalMeasurementService, MeasurementOption} from 'common';

/**
 * "Add measurement" dialog: record an observation for a goal of the plan, with the code of the goal target and
 * - a quantity in the unit of the target (detailQuantity / detailRange), or
 * - a coded value (detailCodeableConcept): one of the offered answers (goal targets, the answer list of a CDS concept with
 *   the same code, earlier answers of the patient) or a free text answer when none fits.
 *
 * Render it with *ngIf and remove it on (closed).
 */
@Component({
  selector: 'rp-add-measurement-dialog',
  templateUrl: './add-measurement-dialog.component.html'
})
export class AddMeasurementDialogComponent implements OnInit, OnDestroy {

  @Input({required: true}) patientId!: string;
  /** Measurements to choose from (GoalMeasurementService.measurements of the plan's goals) */
  @Input({required: true}) measurements: GoalMeasurement[] = [];
  /** Preselected measurement (key) */
  @Input() selected?: string;
  @Output() saved = new EventEmitter<fhir4.Observation>();
  @Output() closed = new EventEmitter<void>();

  readonly OTHER = '__other__';
  form = {key: '', value: <number | null>null, answer: '', text: '', effective: ''};
  options: MeasurementOption[] = [];
  loadingOptions = false;
  saving = false;
  error?: string;

  constructor(private sof: SmartOnFhirService, private goalMeasurements: GoalMeasurementService) {
  }

  ngOnInit(): void {
    document.body.classList.add('modal-open');
    this.form.effective = AddMeasurementDialogComponent.localDateTime(new Date());
    this.select(this.selected && this.measurements.some(m => m.key === this.selected) ? this.selected : this.measurements[0]?.key || '');
  }

  ngOnDestroy(): void {
    document.body.classList.remove('modal-open');
  }

  get measurement(): GoalMeasurement | undefined {
    return this.measurements.find(m => m.key === this.form.key);
  }

  get unitLabel(): string {
    return this.measurement?.unit?.unit || this.measurement?.unit?.code || '';
  }

  /** Options grouped for the select, with the source as group label */
  get optionGroups(): { label: string, options: MeasurementOption[] }[] {
    const labels: { [source: string]: string } = {goal: 'Goal', cds: 'Answers', history: 'Recorded before'};
    return ['goal', 'cds', 'history'].map(source => ({label: labels[source], options: this.options.filter(o => o.source === source)}))
      .filter(group => group.options.length);
  }

  async select(key: string): Promise<void> {
    this.form = {...this.form, key, value: null, answer: '', text: ''};
    this.options = [];
    this.error = undefined;
    const measurement = this.measurement;
    if (measurement?.kind !== 'concept') return;
    this.loadingOptions = true;
    try {
      const options = await this.goalMeasurements.options(measurement, this.patientId);
      if (this.form.key === key) {
        this.options = options;
        this.form.answer = options.length ? '' : this.OTHER;
      }
    } finally {
      this.loadingOptions = false;
    }
  }

  get canSave(): boolean {
    const measurement = this.measurement;
    if (!measurement || this.saving || !this.form.effective) return false;
    if (measurement.kind === 'quantity') {
      return this.form.value !== null && !isNaN(Number(this.form.value));
    }
    return this.form.answer === this.OTHER ? !!this.form.text.trim() : !!this.form.answer;
  }

  async save(): Promise<void> {
    const measurement = this.measurement;
    if (!measurement || !this.canSave) return;
    let value: number | fhir4.CodeableConcept;
    if (measurement.kind === 'quantity') {
      value = Number(this.form.value);
    } else if (this.form.answer === this.OTHER) {
      value = {text: this.form.text.trim()};
    } else {
      const option = this.options[Number(this.form.answer)];
      value = {coding: [{...option.coding}], text: option.coding.display || option.coding.code};
    }
    this.saving = true;
    this.error = undefined;
    try {
      const observation = GoalMeasurementService.observation(measurement, this.patientId, value, new Date(this.form.effective).toISOString());
      const created = await this.sof.create<fhir4.Observation>(observation);
      this.saved.emit(created || observation);
      this.closed.emit();
    } catch (err) {
      console.error('Measurement could not be saved', err);
      this.error = 'The measurement could not be saved: ' + ((err as Error)?.message || err);
    } finally {
      this.saving = false;
    }
  }

  close(): void {
    if (!this.saving) this.closed.emit();
  }

  optionIndex(option: MeasurementOption): number {
    return this.options.indexOf(option);
  }

  /** yyyy-MM-ddTHH:mm in local time, for datetime-local inputs */
  private static localDateTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
