import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CdsPanelsComponent } from './cds-panels.component';

describe('CdsPanelsComponent', () => {
  let component: CdsPanelsComponent;
  let fixture: ComponentFixture<CdsPanelsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CdsPanelsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CdsPanelsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
