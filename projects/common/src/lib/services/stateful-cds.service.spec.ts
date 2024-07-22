import { TestBed } from '@angular/core/testing';

import { StatefulCdsService } from './stateful-cds.service';

describe('StatefulCdsService', () => {
  let service: StatefulCdsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StatefulCdsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
