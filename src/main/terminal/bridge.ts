export const PTY_BRIDGE = `
import os, pty, sys, select, struct, fcntl, termios, signal
cols, rows = int(sys.argv[1]), int(sys.argv[2])
cmd = sys.argv[3:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
stdin = sys.stdin.fileno()
stdout = sys.stdout.fileno()
open_in = True
while True:
    watch = [fd] + ([stdin] if open_in else [])
    try:
        r, _, _ = select.select(watch, [], [])
    except InterruptedError:
        continue
    if fd in r:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        os.write(stdout, data)
    if open_in and stdin in r:
        data = os.read(stdin, 65536)
        if not data:
            open_in = False
        elif data.startswith(b'\\x1b]kokpit-resize;'):
            try:
                c, rr = data[len(b'\\x1b]kokpit-resize;'):].split(b'\\x07')[0].split(b';')
                fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', int(rr), int(c), 0, 0))
                os.kill(pid, signal.SIGWINCH)
            except Exception:
                pass
        else:
            os.write(fd, data)
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status) if hasattr(os, 'waitstatus_to_exitcode') else 0)
`
