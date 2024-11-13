// usePrimeVue.ts
import { DataTable } from 'primevue/datatable'
import Column from 'primevue/column'

import '../assets/prime-vue.css'
import 'primeicons/primeicons.css'

import '@primevue/themes/lara-light-blue'

export function usePrimeVue(app: any) {
  app.component('DataTable', DataTable)
  app.component('Column', Column)
}