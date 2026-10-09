// SMTC (System Media Transport Controls) native addon.
//
// Bridges the Electron main process to Windows.Media.Playback.MediaPlayer's
// SystemMediaTransportControls, which is the only supported way for a plain
// Win32/Electron process (no package identity / CoreWindow) to publish a
// "Now Playing" session to the OS, readable via
// GlobalSystemMediaTransportControlsSessionManager.
//
// We never actually play media *content* through the MediaPlayer - Sonos
// does the real playback externally, on the speakers. We feed the player a
// silent, looping, in-memory WAV purely so Windows considers it a genuinely
// playing media session (required for OS registration - see CreateSilentLoopSource).
//
// Crucially, MediaPlayer.CommandManager() must stay *enabled* - disabling it
// (to "manually" drive SystemMediaTransportControls) was tried first and
// found to silently prevent the process from ever appearing in
// GlobalSystemMediaTransportControlsSessionManager.GetSessions() at all.
// With CommandManager enabled, metadata must be set via a MediaPlaybackItem's
// display properties (not SystemMediaTransportControls.DisplayUpdater
// directly - CommandManager overwrites/ignores that). Playback status is
// driven by both toggling player.Play()/Pause() on the silent loop (keeping
// the real MediaPlaybackSession state truthful) AND setting
// SystemMediaTransportControls.PlaybackStatus directly, since CommandManager
// doesn't reliably push a fresh status update on its own. Button presses are
// observed via CommandManager's PlayReceived/PauseReceived/NextReceived/
// PreviousReceived events rather than the older
// SystemMediaTransportControls.ButtonPressed event.
//
// Windows resolves the friendly app name shown alongside a session (e.g. in
// the volume flyout) by looking up a Start Menu shortcut whose property
// store has a matching System.AppUserModel.ID and a System.Title - without
// one it just shows "Unknown app". EnsureAppUserModelShortcut() creates/
// refreshes that shortcut on every init() so unpackaged dev builds (and any
// packaged build without an installer-created shortcut) still get a proper
// display name.

#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <napi.h>
#include <windows.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <propkey.h>
#include <propvarutil.h>
#include <string>
#include <vector>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Media.Control.h>
#include <winrt/Windows.Media.h>
#include <winrt/Windows.Media.Core.h>
#include <winrt/Windows.Media.Playback.h>
#include <winrt/Windows.Storage.Streams.h>

using namespace winrt;
using namespace winrt::Windows::Foundation;
using namespace winrt::Windows::Media;
using namespace winrt::Windows::Media::Control;
using namespace winrt::Windows::Media::Core;
using namespace winrt::Windows::Media::Playback;
using namespace winrt::Windows::Storage::Streams;

namespace {

MediaPlayer g_player{nullptr};
MediaPlaybackItem g_item{nullptr};
winrt::event_token g_playToken{};
winrt::event_token g_pauseToken{};
winrt::event_token g_nextToken{};
winrt::event_token g_prevToken{};
Napi::ThreadSafeFunction g_tsfn;
bool g_initialized = false;
bool g_hasCallback = false;

std::wstring Utf8ToWide(const std::string& s) {
  if (s.empty()) return std::wstring();
  int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), nullptr, 0);
  std::wstring out(len, 0);
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), out.data(), len);
  return out;
}

// Creates (or refreshes) a per-user Start Menu shortcut carrying the
// System.AppUserModel.ID / System.Title property pair Windows needs to
// resolve our AUMID to a friendly name ("True Tunes") instead of
// "Unknown app" in the volume flyout / Now Playing overlay. Safe to call on
// every init() - it's a cheap, idempotent file write.
void EnsureAppUserModelShortcut(const std::wstring& aumid, const std::wstring& displayName,
                                 const std::wstring& exeArgs, const std::wstring& workingDir) {
  try {
    wchar_t exePath[MAX_PATH]{};
    if (GetModuleFileNameW(nullptr, exePath, MAX_PATH) == 0) return;

    PWSTR programsPath = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_Programs, 0, nullptr, &programsPath)) || !programsPath) {
      return;
    }
    std::wstring linkPath = std::wstring(programsPath) + L"\\" + displayName + L".lnk";
    CoTaskMemFree(programsPath);

    auto shellLink = winrt::create_instance<IShellLinkW>(CLSID_ShellLink, CLSCTX_INPROC_SERVER);
    if (!shellLink) return;

    shellLink->SetPath(exePath);
    if (!exeArgs.empty()) shellLink->SetArguments(exeArgs.c_str());
    if (!workingDir.empty()) shellLink->SetWorkingDirectory(workingDir.c_str());

    winrt::com_ptr<IPropertyStore> propStore = shellLink.try_as<IPropertyStore>();
    if (propStore) {
      PROPVARIANT pv;
      if (SUCCEEDED(InitPropVariantFromString(aumid.c_str(), &pv))) {
        propStore->SetValue(PKEY_AppUserModel_ID, pv);
        PropVariantClear(&pv);
      }
      if (SUCCEEDED(InitPropVariantFromString(displayName.c_str(), &pv))) {
        propStore->SetValue(PKEY_Title, pv);
        PropVariantClear(&pv);
      }
      propStore->Commit();
    }

    winrt::com_ptr<IPersistFile> persistFile = shellLink.try_as<IPersistFile>();
    if (persistFile) {
      persistFile->Save(linkPath.c_str(), TRUE);
    }
  } catch (...) {
    // Best-effort - a missing/stale shortcut only degrades the display name,
    // never SMTC registration itself.
  }
}

void NotifyJs(const char* action) {
  if (!g_hasCallback) return;
  std::string actionStr = action;
  g_tsfn.BlockingCall([actionStr](Napi::Env env, Napi::Function jsCallback) {
    jsCallback.Call({Napi::String::New(env, actionStr)});
  });
}

// Windows only registers a process with
// GlobalSystemMediaTransportControlsSessionManager once the MediaPlayer is
// actually playing a real media source - manipulating
// SystemMediaTransportControls alone (with no active playback) is not
// enough. We don't have a real local media file (Sonos does the actual
// playback externally), so we synthesize a tiny silent, looping WAV in
// memory purely to keep MediaPlayer "playing" and therefore registered.
MediaSource CreateSilentLoopSource() {
  constexpr uint32_t sampleRate = 8000;
  constexpr uint32_t durationSeconds = 1;
  constexpr uint32_t numSamples = sampleRate * durationSeconds;
  constexpr uint32_t dataBytes = numSamples * 2;  // 16-bit mono
  constexpr uint32_t fmtChunkSize = 16;
  constexpr uint32_t riffSize = 4 + (8 + fmtChunkSize) + (8 + dataBytes);

  std::vector<uint8_t> bytes;
  bytes.reserve(44 + dataBytes);

  auto push32 = [&bytes](uint32_t v) {
    bytes.push_back(static_cast<uint8_t>(v & 0xFF));
    bytes.push_back(static_cast<uint8_t>((v >> 8) & 0xFF));
    bytes.push_back(static_cast<uint8_t>((v >> 16) & 0xFF));
    bytes.push_back(static_cast<uint8_t>((v >> 24) & 0xFF));
  };
  auto push16 = [&bytes](uint16_t v) {
    bytes.push_back(static_cast<uint8_t>(v & 0xFF));
    bytes.push_back(static_cast<uint8_t>((v >> 8) & 0xFF));
  };
  auto pushTag = [&bytes](const char tag[5]) {
    bytes.insert(bytes.end(), tag, tag + 4);
  };

  pushTag("RIFF");
  push32(riffSize);
  pushTag("WAVE");
  pushTag("fmt ");
  push32(fmtChunkSize);
  push16(1);           // PCM
  push16(1);           // mono
  push32(sampleRate);
  push32(sampleRate * 2);  // byte rate (sampleRate * blockAlign)
  push16(2);           // block align
  push16(16);          // bits per sample
  pushTag("data");
  push32(dataBytes);
  bytes.insert(bytes.end(), dataBytes, 0);  // silence

  InMemoryRandomAccessStream stream;
  DataWriter writer(stream);
  writer.WriteBytes(array_view<uint8_t const>(bytes.data(), bytes.data() + bytes.size()));
  writer.StoreAsync().get();
  writer.DetachStream();
  stream.Seek(0);

  return MediaSource::CreateFromStream(stream, L"audio/wav");
}

Napi::Value Init(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (g_initialized) return env.Undefined();

  try {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
  } catch (...) {
    // Already initialized on this thread - fine.
  }

  // SMTC/GlobalSystemMediaTransportControlsSessionManager only surfaces
  // sessions for processes with an explicit AppUserModelID when unpackaged
  // (no MSIX identity). Set one before creating the MediaPlayer - must run
  // before any window/GDI object is created in the process (see init()'s
  // call site in src/main.ts).
  const std::wstring aumid = L"TrueNorthIT.TrueTunes";
  SetCurrentProcessExplicitAppUserModelID(aumid.c_str());

  // Optional second argument: { appPath, isPackaged, displayName } - used
  // solely to build a Start Menu shortcut so Windows can resolve a friendly
  // app name for this AUMID instead of showing "Unknown app". See
  // EnsureAppUserModelShortcut() above.
  std::wstring displayName = L"True Tunes";
  std::wstring exeArgs;
  std::wstring workingDir;
  if (info.Length() > 1 && info[1].IsObject()) {
    Napi::Object opts = info[1].As<Napi::Object>();
    if (opts.Has("displayName") && opts.Get("displayName").IsString()) {
      displayName = Utf8ToWide(opts.Get("displayName").As<Napi::String>().Utf8Value());
    }
    bool isPackaged = opts.Has("isPackaged") && opts.Get("isPackaged").ToBoolean().Value();
    if (!isPackaged && opts.Has("appPath") && opts.Get("appPath").IsString()) {
      std::wstring appPath = Utf8ToWide(opts.Get("appPath").As<Napi::String>().Utf8Value());
      exeArgs = L"\"" + appPath + L"\"";
      workingDir = appPath;
    }
  }
  EnsureAppUserModelShortcut(aumid, displayName, exeArgs, workingDir);

  try {
    g_item = MediaPlaybackItem(CreateSilentLoopSource());

    g_player = MediaPlayer();
    g_player.IsLoopingEnabled(true);
    g_player.Volume(0.0);
    g_player.Source(g_item);

    auto cmdManager = g_player.CommandManager();
    cmdManager.IsEnabled(true);
    cmdManager.NextBehavior().EnablingRule(MediaCommandEnablingRule::Always);
    cmdManager.PreviousBehavior().EnablingRule(MediaCommandEnablingRule::Always);

    if (info.Length() > 0 && info[0].IsFunction()) {
      g_tsfn = Napi::ThreadSafeFunction::New(
          env, info[0].As<Napi::Function>(), "SmtcButtonPressed", 0, 1);
      g_hasCallback = true;

      g_playToken = cmdManager.PlayReceived(
          [](MediaPlaybackCommandManager const&, MediaPlaybackCommandManagerPlayReceivedEventArgs const&) {
            NotifyJs("play");
          });
      g_pauseToken = cmdManager.PauseReceived(
          [](MediaPlaybackCommandManager const&, MediaPlaybackCommandManagerPauseReceivedEventArgs const&) {
            NotifyJs("pause");
          });
      g_nextToken = cmdManager.NextReceived(
          [](MediaPlaybackCommandManager const&, MediaPlaybackCommandManagerNextReceivedEventArgs const& args) {
            args.Handled(true);  // we have no real playback list to advance
            NotifyJs("next");
          });
      g_prevToken = cmdManager.PreviousReceived(
          [](MediaPlaybackCommandManager const&, MediaPlaybackCommandManagerPreviousReceivedEventArgs const& args) {
            args.Handled(true);  // we have no real playback list to rewind
            NotifyJs("previous");
          });
    }

    // Real (silent) playback must actually be happening for Windows to
    // register this process with GlobalSystemMediaTransportControlsSessionManager.
    g_player.Play();

    g_initialized = true;
  } catch (winrt::hresult_error const& ex) {
    Napi::Error::New(env, winrt::to_string(ex.message())).ThrowAsJavaScriptException();
  }

  return env.Undefined();
}

Napi::Value SetMetadata(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_initialized || info.Length() < 1 || !info[0].IsObject()) return env.Undefined();

  Napi::Object opts = info[0].As<Napi::Object>();

  try {
    auto props = g_item.GetDisplayProperties();
    props.Type(MediaPlaybackType::Music);
    auto music = props.MusicProperties();

    music.Title(opts.Has("title") && opts.Get("title").IsString()
                    ? Utf8ToWide(opts.Get("title").As<Napi::String>().Utf8Value())
                    : L"");
    music.Artist(opts.Has("artist") && opts.Get("artist").IsString()
                     ? Utf8ToWide(opts.Get("artist").As<Napi::String>().Utf8Value())
                     : L"");
    music.AlbumTitle(opts.Has("album") && opts.Get("album").IsString()
                          ? Utf8ToWide(opts.Get("album").As<Napi::String>().Utf8Value())
                          : L"");

    if (opts.Has("thumbnailUrl") && opts.Get("thumbnailUrl").IsString()) {
      std::string url = opts.Get("thumbnailUrl").As<Napi::String>().Utf8Value();
      try {
        Uri uri(Utf8ToWide(url));
        auto ref = RandomAccessStreamReference::CreateFromUri(uri);
        props.Thumbnail(ref);
      } catch (...) {
        props.Thumbnail(nullptr);
      }
    } else {
      props.Thumbnail(nullptr);
    }

    g_item.ApplyDisplayProperties(props);
  } catch (winrt::hresult_error const& ex) {
    Napi::Error::New(env, winrt::to_string(ex.message())).ThrowAsJavaScriptException();
  }

  return env.Undefined();
}

Napi::Value SetPlaybackStatus(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_initialized || info.Length() < 1 || !info[0].IsString()) return env.Undefined();

  std::string status = info[0].As<Napi::String>().Utf8Value();

  try {
    // Toggle the (silent) player so the MediaPlaybackSession's real state
    // stays truthful. In practice CommandManager doesn't reliably push a
    // fresh PlaybackStatus update to SMTC off the back of this alone (a
    // session polled soon after Play() can still read back "Paused"), so we
    // also set SystemMediaTransportControls.PlaybackStatus directly as a
    // belt-and-braces measure - this does NOT appear to be overwritten by
    // CommandManager outside of real button-triggered transitions.
    MediaPlaybackStatus mapped = MediaPlaybackStatus::Closed;
    if (status == "playing") {
      g_player.Play();
      mapped = MediaPlaybackStatus::Playing;
    } else if (status == "paused") {
      g_player.Pause();
      mapped = MediaPlaybackStatus::Paused;
    } else {
      g_player.Pause();
      mapped = MediaPlaybackStatus::Stopped;
    }
    g_player.SystemMediaTransportControls().PlaybackStatus(mapped);
  } catch (winrt::hresult_error const&) {
    // Ignore - nothing actionable if this fails.
  }

  return env.Undefined();
}

Napi::Value GetDebugState(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object out = Napi::Object::New(env);
  out.Set("initialized", g_initialized);
  if (g_initialized) {
    out.Set("playbackState", static_cast<int>(g_player.PlaybackSession().PlaybackState()));
  }
  return out;
}

Napi::Value ListSessions(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array result = Napi::Array::New(env);
  try {
    auto manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get();
    auto sessions = manager.GetSessions();
    uint32_t count = sessions.Size();
    for (uint32_t i = 0; i < count; i++) {
      auto session = sessions.GetAt(i);
      Napi::Object entry = Napi::Object::New(env);
      entry.Set("appId", winrt::to_string(session.SourceAppUserModelId()));
      try {
        auto props = session.TryGetMediaPropertiesAsync().get();
        entry.Set("title", winrt::to_string(props.Title()));
        entry.Set("artist", winrt::to_string(props.Artist()));
        // Note: deliberately not calling Thumbnail().OpenReadAsync() here -
        // it can deadlock when invoked from this thread's apartment context.
        entry.Set("hasThumbnailRef", props.Thumbnail() != nullptr);
      } catch (...) {
      }
      entry.Set("status", static_cast<int>(session.GetPlaybackInfo().PlaybackStatus()));
      result.Set(i, entry);
    }
  } catch (winrt::hresult_error const& ex) {
    Napi::Error::New(env, winrt::to_string(ex.message())).ThrowAsJavaScriptException();
    return result;
  }
  return result;
}

// Debug-only: simulate Windows invoking a transport command on our SMTC
// session (as the volume flyout / hardware media keys would), from a
// *separate* process. Used to verify
// MediaPlaybackCommandManager.PlayReceived/PauseReceived/NextReceived/
// PreviousReceived actually fire end-to-end - this can't be exercised from
// within the same process that owns the session.
Napi::Value SimulateRemoteCommand(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) return Napi::Boolean::New(env, false);
  std::string action = info[0].As<Napi::String>().Utf8Value();

  try {
    auto manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get();
    auto sessions = manager.GetSessions();
    uint32_t count = sessions.Size();
    for (uint32_t i = 0; i < count; i++) {
      auto session = sessions.GetAt(i);
      if (session.SourceAppUserModelId() != L"TrueNorthIT.TrueTunes") continue;

      bool ok = false;
      if (action == "play") {
        ok = session.TryPlayAsync().get();
      } else if (action == "pause") {
        ok = session.TryPauseAsync().get();
      } else if (action == "next") {
        ok = session.TrySkipNextAsync().get();
      } else if (action == "previous") {
        ok = session.TrySkipPreviousAsync().get();
      }
      return Napi::Boolean::New(env, ok);
    }
  } catch (winrt::hresult_error const& ex) {
    Napi::Error::New(env, winrt::to_string(ex.message())).ThrowAsJavaScriptException();
  }

  return Napi::Boolean::New(env, false);
}

Napi::Value SetPositionState(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_initialized || info.Length() < 1 || !info[0].IsObject()) return env.Undefined();

  Napi::Object opts = info[0].As<Napi::Object>();
  double durationSec = opts.Has("duration") ? opts.Get("duration").As<Napi::Number>().DoubleValue() : 0;
  double positionSec = opts.Has("position") ? opts.Get("position").As<Napi::Number>().DoubleValue() : 0;

  try {
    SystemMediaTransportControlsTimelineProperties timeline;
    timeline.StartTime(TimeSpan(0));
    timeline.MinSeekTime(TimeSpan(0));
    timeline.MaxSeekTime(TimeSpan(static_cast<int64_t>(durationSec * 10000000.0)));
    timeline.EndTime(TimeSpan(static_cast<int64_t>(durationSec * 10000000.0)));
    timeline.Position(TimeSpan(static_cast<int64_t>(positionSec * 10000000.0)));
    g_player.SystemMediaTransportControls().UpdateTimelineProperties(timeline);
  } catch (winrt::hresult_error const&) {
    // Ignore - position state is best-effort.
  }

  return env.Undefined();
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_initialized) return env.Undefined();

  try {
    if (g_player) {
      auto cmdManager = g_player.CommandManager();
      cmdManager.PlayReceived(g_playToken);
      cmdManager.PauseReceived(g_pauseToken);
      cmdManager.NextReceived(g_nextToken);
      cmdManager.PreviousReceived(g_prevToken);
      g_player.Pause();
    }
  } catch (...) {
  }

  if (g_hasCallback) {
    g_tsfn.Release();
    g_hasCallback = false;
  }

  g_item = nullptr;
  g_player = nullptr;
  g_initialized = false;

  return env.Undefined();
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
  exports.Set("init", Napi::Function::New(env, Init));
  exports.Set("setMetadata", Napi::Function::New(env, SetMetadata));
  exports.Set("setPlaybackStatus", Napi::Function::New(env, SetPlaybackStatus));
  exports.Set("setPositionState", Napi::Function::New(env, SetPositionState));
  exports.Set("getDebugState", Napi::Function::New(env, GetDebugState));
  exports.Set("listSessions", Napi::Function::New(env, ListSessions));
  exports.Set("simulateRemoteCommand", Napi::Function::New(env, SimulateRemoteCommand));
  exports.Set("shutdown", Napi::Function::New(env, Shutdown));
  return exports;
}

}  // namespace

NODE_API_MODULE(smtc, InitModule)
