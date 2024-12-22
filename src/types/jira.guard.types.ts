export type JiraConfigType = {
  availabilityListKeys?: string[]
  isSuperAdmin?: boolean
  relationNames?: string[]
  selfSalaryRelationByTgAndProject?: SelfSalaryRelationByTgAndProject[]
  allSalaryRelationByTgAndProject?: SalaryRelationByTgAndProject
}

export type SelfSalaryRelationByTgAndProject = {
  amount: string
  currency: string
  type: 'fixed' | 'hourly'
  key?: string
}

export type SalaryRelationByTgAndProject = Record<string, SelfSalaryRelationByTgAndProject[]>
