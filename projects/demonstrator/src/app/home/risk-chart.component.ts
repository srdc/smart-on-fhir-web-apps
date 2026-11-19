import {Component, Input} from '@angular/core';
import {PatientModelOutput} from '../storyboard.service';

/** The highest disease risks of a storyboard patient, as computed for the storyboard document */
@Component({
  selector: 'demo-risk-chart',
  template: `
    <div class="small text-muted mb-1">Risks in the storyboard document</div>
    @for (risk of risks; track risk.disease) {
      <div class="risk-row">
        <span class="risk-label text-truncate" [title]="risk.disease">{{ risk.disease }}</span>
        <span class="risk-track"><span class="risk-bar" [class]="riskClass(risk.p)" [style.width.%]="risk.p / max * 100"></span></span>
        <span class="risk-value">{{ risk.p * 100 | number: '1.1-1' }}%</span>
      </div>
    }
  `
})
export class RiskChartComponent {
  @Input() count = 4;
  risks: { disease: string, p: number }[] = [];
  max = 1;

  @Input() set model(model: PatientModelOutput | undefined) {
    this.risks = Object.entries(model?.predictions || {}).map(([disease, p]) => ({disease, p}))
      .sort((a, b) => b.p - a.p).slice(0, this.count);
    this.max = Math.max(0.3, ...this.risks.map(r => r.p));
  }

  /** Risk classes of the storyboard document and the results page: high ≥ 15%, moderate ≥ 5% */
  riskClass(p: number): string {
    return p >= .15 ? 'bg-risk-high' : p >= .05 ? 'bg-risk-moderate' : 'bg-risk-low';
  }
}
