import { TestBed } from '@angular/core/testing';

import { CdsHooksService } from './cds-hooks.service';

describe('CdsHooksService', () => {
  let service: CdsHooksService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CdsHooksService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
