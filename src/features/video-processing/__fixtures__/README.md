# Remux spike fixtures

These tiny synthetic files contain no user media. Regenerate them with FFmpeg 8 or newer from the repository root:

```powershell
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -c:v libx264 -pix_fmt yuv420p -g 10 -bf 0 -movflags +faststart -y src/features/video-processing/__fixtures__/h264-video.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=0.979667" -af "asetpts=PTS+0.021333/TB" -c:v libx264 -pix_fmt yuv420p -g 10 -bf 0 -c:a aac -b:a 64k -movflags +faststart -y src/features/video-processing/__fixtures__/h264-aac.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=25:duration=0.84" -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=0.979667" -af "asetpts=PTS+0.021333/TB" -c:v libx264 -pix_fmt yuv420p -g 25 -bf 2 -c:a aac -b:a 64k -movflags +faststart -y src/features/video-processing/__fixtures__/h264-aac-short-video.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -f lavfi -i "sine=frequency=660:sample_rate=48000:duration=1" -c:v libx264 -pix_fmt yuv420p -g 10 -bf 0 -c:a aac -b:a 64k -shortest -movflags +faststart -y src/features/video-processing/__fixtures__/h264-aac-priming.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -c:v libx265 -x265-params "log-level=error:pools=1" -pix_fmt yuv420p -tag:v hvc1 -movflags +faststart -y src/features/video-processing/__fixtures__/unsupported-video.mp4
```

`h264-video.mp4` and `h264-aac.mp4` exercise supported packet-copy remuxing. The aligned AAC fixtures deliberately compensate for the encoder's 1024-sample priming delay. `h264-aac-short-video.mp4` has a 1-second AAC/container timeline and a 0.84-second video track, exercising the bounded final-frame hold. `h264-aac-priming.mp4` keeps the ordinary negative priming packet and exercises the audio-only re-encoding fallback. `unsupported-video.mp4` verifies explicit rejection of non-H.264 video.
