export namespace CDSHooks {
  interface DiscoveryResponse {
    hook: string;
    title?: string;
    description: string;
    id: string;
    prefetch?: {[key: string]: string};
    usageRequirements?: string;
  }

  interface FhirAuthorization {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    subject?: string;
    [key: string]: any;
  }

  interface ServiceRequest {
    hook: string;
    hookInstance: string;
    fhirServer?: string;
    fhirAuthorization?: FhirAuthorization;
    context: {[key: string]: any};
    prefetch?: {[key: string]: any};
  }
}
