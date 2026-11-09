import { TestBed } from '@angular/core/testing';

import { ShlApiService } from './shl-api.service';

describe('ShlApiService', () => {
  let service: ShlApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ShlApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
