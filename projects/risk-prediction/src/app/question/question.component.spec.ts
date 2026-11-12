import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuestionComponent } from './question.component';

describe('QuestionComponent', () => {
  let component: QuestionComponent;
  let fixture: ComponentFixture<QuestionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [QuestionComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(QuestionComponent);
    component = fixture.componentInstance;
    component.q = {linkId: '21001', text: 'BMI', type: 'decimal'};
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('formats a frozen read-only number without changing its answer', () => {
    component.readonly = true;
    component.answers = {'21001': 19.648793058415947};

    expect(component.displayNumericValue()).toBe('19.65');
    expect(component.answers['21001']).toBe(19.648793058415947);
  });

  it('does not format editable questionnaire values', () => {
    component.answers = {'21001': 19.648793058415947};

    expect(component.displayNumericValue()).toBe(19.648793058415947);
  });
});
