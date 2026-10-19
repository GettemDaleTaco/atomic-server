import 'dart:io';

Future<bool> openSystemCommandWindowImpl() async {
  if (!Platform.isLinux) return false;

  const terminalCommands = <List<String>>[
    ['x-terminal-emulator'],
    ['gnome-terminal'],
    ['konsole'],
    ['xfce4-terminal'],
    ['xterm'],
    ['kitty'],
    ['alacritty'],
  ];

  for (final command in terminalCommands) {
    try {
      await Process.start(
        command.first,
        command.skip(1).toList(),
        mode: ProcessStartMode.detached,
      );
      return true;
    } catch (_) {}
  }

  return false;
}
