import 'command_window_service_stub.dart'
    if (dart.library.io) 'command_window_service_io.dart';

Future<bool> openSystemCommandWindow() => openSystemCommandWindowImpl();
