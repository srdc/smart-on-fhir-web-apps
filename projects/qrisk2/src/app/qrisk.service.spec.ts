import { TestBed } from '@angular/core/testing';

import { QriskService } from './qrisk.service';

describe('QriskService', () => {
  let service: QriskService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QriskService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
