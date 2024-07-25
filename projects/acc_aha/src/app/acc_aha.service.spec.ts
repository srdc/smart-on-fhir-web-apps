import { TestBed } from '@angular/core/testing';

import { ACCAHAService } from './acc_aha.service';

describe('ACCAHAService', () => {
  let service: ACCAHAService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ACCAHAService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
