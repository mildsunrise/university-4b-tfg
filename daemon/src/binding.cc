#if defined(__GNUC__) && __GNUC__ >= 8
#define DISABLE_WCAST_FUNCTION_TYPE _Pragma("GCC diagnostic push") _Pragma("GCC diagnostic ignored \"-Wcast-function-type\"")
#define DISABLE_WCAST_FUNCTION_TYPE_END _Pragma("GCC diagnostic pop")
#else
#define DISABLE_WCAST_FUNCTION_TYPE
#define DISABLE_WCAST_FUNCTION_TYPE_END
#endif

DISABLE_WCAST_FUNCTION_TYPE
#include <nan.h>
DISABLE_WCAST_FUNCTION_TYPE_END

#include <errno.h>
#include <unistd.h>
#include <sys/syscall.h>

NAN_METHOD(SetIoprio) {
    int which = Nan::To<int>(info[0]).FromJust();
    int who = Nan::To<int>(info[1]).FromJust();
    int ioprio = Nan::To<int>(info[2]).FromJust();
    int res = syscall(SYS_ioprio_set, which, who, ioprio);
    if (res < 0)
        Nan::ThrowError(Nan::ErrnoException(errno, "ioprio_set", "Could not set I/O priority"));
}

NAN_MODULE_INIT(Init) {
    Nan::SetMethod(target, "setIoprio", SetIoprio);
}

DISABLE_WCAST_FUNCTION_TYPE
NODE_MODULE(native_binding, Init)
DISABLE_WCAST_FUNCTION_TYPE_END
