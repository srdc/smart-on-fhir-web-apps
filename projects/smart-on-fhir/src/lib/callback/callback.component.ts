import {Component, OnInit} from '@angular/core';
import * as FHIR from 'fhirclient'
import {ActivatedRoute, Router} from "@angular/router";

@Component({
  selector: 'lib-callback',
  templateUrl: './callback.component.html',
  styleUrl: './callback.component.css'
})
export class CallbackComponent implements OnInit {

  constructor(private router: Router, private route: ActivatedRoute) {
  }

  ngOnInit() {
    this.route.data.subscribe(data => {
      FHIR.oauth2.ready().then(() => {
        sessionStorage.setItem('authorized', 'true')
        this.router.navigate([data['redirectTo']])
      }, console.error)
    })
  }
}
