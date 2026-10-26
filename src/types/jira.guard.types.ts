export type JiraConfigType = {
  availabilityListKeys?: string[]
  isSuperAdmin?: boolean
  relationNames?: string[]
}

export type SelfSalaryRelationByTgAndProject = {
  amount: string
  currency: string
  type: 'fixed' | 'hourly'
  key?: string
  hours?: number
}

export type SalaryRelationByTgAndProject = Record<string, SelfSalaryRelationByTgAndProject[]>
