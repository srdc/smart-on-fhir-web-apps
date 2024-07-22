import { TestBed } from '@angular/core/testing';

import { SmartOnFhirService } from './smart-on-fhir.service';

describe('SmartOnFhirService', () => {
  let service: SmartOnFhirService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SmartOnFhirService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
