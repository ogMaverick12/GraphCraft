export interface NoticePackageRecord {
  name: string
  license: string
  licenseFile: string
  purpose: string
  noticeFiles?: string[]
  buildTime?: boolean
  licenseNote?: string
}

export interface NoticePackageSummary {
  name: string
  version: string
  license: string
}

export interface BuildNoticeBundleOptions {
  rootDir?: string
  bundledPackageNames: string[]
  buildTimePackageNames?: string[]
  records?: NoticePackageRecord[]
}

export interface BuiltNoticeBundle {
  license: Uint8Array
  notices: string
  runtimePackages: NoticePackageSummary[]
  buildTimePackages: NoticePackageSummary[]
}

export interface ValidateDistributionOptions {
  rootDir?: string
  distDir?: string
  records?: NoticePackageRecord[]
}

export interface ValidatedDistribution {
  runtimePackages: NoticePackageSummary[]
  buildTimePackages: NoticePackageSummary[]
}

export const LICENSE_FILE_NAME: string
export const LICENSE_TXT_FILE_NAME: string
export const NOTICE_FILE_NAME: string
export const PROJECT_LICENSE: string
export const PROJECT_COPYRIGHT: string
export const PACKAGE_RECORDS: NoticePackageRecord[]

export function packageNameFromModuleId(moduleId: string): string | null
export function collectBundledPackageNames(bundle: Record<string, unknown>): string[]
export function buildNoticeBundle(options?: BuildNoticeBundleOptions): BuiltNoticeBundle
export function validateDistribution(options?: ValidateDistributionOptions): ValidatedDistribution
