import { TestBed } from '@angular/core/testing';

import { Qrisk3Service } from './qrisk3.service';

describe('Qrisk3Service', () => {
  let service: Qrisk3Service;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Qrisk3Service);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
