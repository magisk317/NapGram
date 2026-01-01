export function debounce<TArgs extends any[], TRet, TThis>(fn: (this: TThis, ...originArgs: TArgs) => TRet, dur = 100) {
  let timer: NodeJS.Timeout | undefined
  return function (this: TThis, ...args: TArgs) {
    clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, dur)
  }
}

export function throttle<TArgs extends any[], TRet, TThis>(fn: (this: TThis, ...originArgs: TArgs) => TRet, time = 500) {
  let timer: NodeJS.Timeout | undefined
  return function (this: TThis, ...args: TArgs) {
    if (timer == null) {
      fn.apply(this, args)
      timer = setTimeout(() => {
        timer = undefined
      }, time)
    }
  }
}

export function consumer<TArgs extends any[], TRet, TThis>(fn: (this: TThis, ...originArgs: TArgs) => TRet, time = 100) {
  const tasks: Array<() => TRet> = []
  let timer: NodeJS.Timeout | undefined

  const nextTask = () => {
    if (tasks.length === 0)
      return false

    const task = tasks.shift()
    task?.()
    return true
  }

  return function (this: TThis, ...args: TArgs) {
    tasks.push((fn as any).bind(this, ...args))

    if (timer == null) {
      nextTask()
      timer = setInterval(() => {
        if (!nextTask()) {
          clearInterval(timer)
          timer = undefined
        }
      }, time)
    }
  }
}
