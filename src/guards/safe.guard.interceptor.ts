import { CallHandler, CanActivate, ExecutionContext, NestInterceptor, UseInterceptors } from '@nestjs/common'
import { isObservable, Observable, of } from 'rxjs'

export abstract class SafeGuardInterceptor implements NestInterceptor, CanActivate {
  abstract canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean>

  async intercept(context: ExecutionContext, next: CallHandler<any>) {
    let result = false
    const returnValue = this.canActivate(context)

    if (isObservable(returnValue)) {
      returnValue.subscribe((value) => {
        if (value) {
          return next.handle()
        } else {
          return of(undefined)
        }
      })

      return of(undefined)
    } else {
      result = await returnValue

      if (result) {
        return next.handle()
      }

      return of(undefined)
    }
  }
}

type Class<I, Args extends any[] = any[]> = new (...args: Args) => I

export const UseSafeGuards = (...arr: Class<SafeGuardInterceptor>[]) => UseInterceptors(...arr)
