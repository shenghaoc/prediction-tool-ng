import { Injectable } from '@angular/core';

type Lang = 'en' | 'zh';

const RESOURCES: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Prediction Tool',
    prediction_form: 'Prediction Form',
    ml_model: 'ML Model',
    town: 'Town',
    storey_range: 'Storey Range',
    flat_model: 'Flat Model',
    floor_area: 'Floor Area (sqm)',
    lease_commence_date: 'Lease Commence Date',
    get_prediction: 'Get Prediction',
    reset_form: 'Reset',
    switch_language: '切换语言 / Switch Language',
    price_prediction: 'Price Prediction',
    predicted_price: 'Predicted Price',
    select_ml_model: 'Select ML Model',
    select_town: 'Select Town',
    select_storey_range: 'Select Storey Range',
    select_flat_model: 'Select Flat Model',
    enter_floor_area: 'Enter floor area',
    missing_floor_area: 'Please enter floor area',
    missing_lease_commence_date: 'Please select lease commence date'
  },
  zh: {
    title: '预测工具',
    prediction_form: '预测表单',
    ml_model: '机器学习模型',
    town: '地点',
    storey_range: '楼层范围',
    flat_model: '单位类型',
    floor_area: '面积（平方米）',
    lease_commence_date: '租约开始年份',
    get_prediction: '获取预测',
    reset_form: '重置',
    switch_language: '切换语言 / Switch Language',
    price_prediction: '价格预测',
    predicted_price: '预测价格',
    select_ml_model: '请选择模型',
    select_town: '请选择地点',
    select_storey_range: '请选择楼层范围',
    select_flat_model: '请选择单位类型',
    enter_floor_area: '请输入面积',
    missing_floor_area: '请输入面积',
    missing_lease_commence_date: '请选择租约开始年份'
  }
};

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private lang: Lang = (typeof window !== 'undefined' && (localStorage.getItem('lang') as Lang)) || 'en';

  translate(key: string): string {
    return RESOURCES[this.lang]?.[key] ?? key;
  }

  currentLang(): Lang {
    return this.lang;
  }

  toggleLanguage(): Lang {
    this.lang = this.lang === 'en' ? 'zh' : 'en';
    if (typeof window !== 'undefined') localStorage.setItem('lang', this.lang);
    return this.lang;
  }
}
