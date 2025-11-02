import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatToolbar } from '@angular/material/toolbar';
import { MatSelect } from '@angular/material/select';
import { MatInput } from '@angular/material/input';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButton } from '@angular/material/button';
import { NgChartsModule } from 'ng2-charts';

import { PredictionToolComponent } from './prediction-tool.component';

const routes: Routes = [
  { path: '', component: PredictionToolComponent }
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    PredictionToolComponent
  ]
})
export class PredictionToolModule { }