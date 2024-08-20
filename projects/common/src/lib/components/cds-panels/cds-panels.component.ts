import {Component, Input, Signal} from '@angular/core';
import { CdsHooksService } from 'cds-hooks';

@Component({
  selector: 'lib-cds-panels',
  templateUrl: './cds-panels.component.html',
  styleUrl: './cds-panels.component.css'
})
export class CdsPanelsComponent {

  groupedConceptDefinitions: { [resourceType: string]: { id: string, value: Signal<any>, [key: string]: any }[] } = {}

  private _conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[] = [];
  @Input() set conceptDefinitions(conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[]) {
    this._conceptDefinitions = conceptDefinitions;
    this.groupedConceptDefinitions = {}
    conceptDefinitions.forEach(definition => {
      if (!this.groupedConceptDefinitions[definition['resourceType']]) {
        this.groupedConceptDefinitions[definition['resourceType']] = []
      }
      this.groupedConceptDefinitions[definition['resourceType']].push(definition)
      const getLabelOrDisplay = (c: any) => c.label || c.code?.display;
      this.groupedConceptDefinitions[definition['resourceType']].sort((c1, c2) => c1['type'] === c2['type'] ? ((getLabelOrDisplay(c1) > getLabelOrDisplay(c2)) ? 1 : -1) : c1['type'] > c2['type'] ? -1 : 1)
    })
  }
  get conceptDefinitions() {
    return this._conceptDefinitions;
  }

  constructor(private cds: CdsHooksService<fhir4.Resource>) {
  }

  updateBooleanValue(definition: any, checked: boolean) {
    this.cds.updateValue(definition.id, (current) => ({ ...current, value: checked, selected: definition.select?.at(0) }))
  }

  updateQuantityValue(definition: any, value: number) {
    this.cds.updateValue(definition.id, (current) => ({ ...current, value }))
  }

  updateCodeableConceptValue(definition: any, code: string) {
    this.cds.setValue(definition.id, definition['select'].find((coding: fhir4.Coding) => coding.code === code))
  }

  updateBooleanSelection(definition: any, code: string) {
    this.cds.updateValue(definition.id, (current) => ({ ...current,
      selected: definition['select'].find((coding: fhir4.Coding) => coding.code === code)}))
  }
  updateBooleanDate(definition: any, date: string) {
    this.cds.updateValue(definition.id, (current) => ({ ...current, date }))
  }

  unknownSelection(definition: { id: string; value: Signal<any>; [p: string]: any }, code: string) {
    return (code && !definition['select'].find((coding: fhir4.Coding) => coding.code === code))
  }
}
