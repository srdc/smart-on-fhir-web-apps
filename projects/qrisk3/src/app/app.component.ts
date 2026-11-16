import {Component} from '@angular/core';
import {CdsBaseComponent, CDSInitializer} from "common";
import {environment} from "../environments/environment";

@Component({
  selector: 'qrisk3-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent extends CdsBaseComponent implements CDSInitializer {
  override serviceName = environment.cds.serviceName;
  ageValid: number = 0;

  override async ngOnInit() {
    await super.ngOnInit();
    this.ageValid = (this.age < 85 && this.age > 24) ? 0 : (this.age < 25 ? 1 : 2)
  }

}
