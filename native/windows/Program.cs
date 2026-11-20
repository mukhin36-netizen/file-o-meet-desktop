// FILE-O Meet Windows system audio: WASAPI loopback, no desktop/video capture.
// Captures the current default Windows playback endpoint, downmixes to mono,
// resamples to 16 kHz, and streams raw s16le PCM only to stdout.
// MIT-licensed NAudio 2.2.1. Console output contains no private filenames
// or transcription. This utility is launched only on explicit Record click.
using System;
using System.Buffers.Binary;
using System.Diagnostics;
using System.IO;
using System.Threading;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace FileoMeetSystemAudio;

internal sealed class SystemMixToMono : ISampleProvider
{
    private readonly BufferedWaveProvider source;
    private readonly WaveFormat input;
    private readonly int channels;
    private readonly int bytesPerFrame;
    private readonly int bytesPerSample;
    private readonly bool floating;
    private byte[] temporary = Array.Empty<byte>();

    private static readonly Guid IeeeFloatSubtype =
        new("00000003-0000-0010-8000-00aa00389b71");

    public WaveFormat WaveFormat { get; }

    public SystemMixToMono(BufferedWaveProvider provider)
    {
        source = provider;
        input = provider.WaveFormat;
        channels = input.Channels;
        if (channels is < 1 or > 16)
            throw new NotSupportedException("Unsupported playback channel count.");
        bytesPerFrame = input.BlockAlign;
        bytesPerSample = input.BitsPerSample / 8;
        floating = input.Encoding == WaveFormatEncoding.IeeeFloat ||
                   (input is WaveFormatExtensible ext &&
                    ext.SubFormat == IeeeFloatSubtype);
        if (bytesPerSample is not (2 or 3 or 4) ||
            bytesPerFrame < channels * bytesPerSample ||
            (floating && bytesPerSample != 4))
            throw new NotSupportedException("Unsupported Windows playback sample format.");
        WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(input.SampleRate, 1);
    }

    public int Read(float[] target, int offset, int count)
    {
        if (count <= 0) return 0;
        int length = checked(count * bytesPerFrame);
        if (temporary.Length < length) temporary = new byte[length];
        int available = source.Read(temporary, 0, length);
        int frames = available / bytesPerFrame;
        for (int frame = 0; frame < frames; frame++)
        {
            int frameStart = frame * bytesPerFrame;
            double sum = 0;
            for (int channel = 0; channel < channels; channel++)
            {
                int at = frameStart + channel * bytesPerSample;
                float sample;
                if (floating)
                {
                    sample = BitConverter.ToSingle(temporary, at);
                }
                else if (bytesPerSample == 4)
                {
                    int value = BinaryPrimitives.ReadInt32LittleEndian(
                        temporary.AsSpan(at, 4));
                    sample = value / 2147483648.0f;
                }
                else if (bytesPerSample == 3)
                {
                    int value = temporary[at] | temporary[at + 1] << 8 |
                                temporary[at + 2] << 16;
                    if ((value & 0x800000) != 0) value |= unchecked((int)0xff000000);
                    sample = value / 8388608.0f;
                }
                else
                {
                    sample = BinaryPrimitives.ReadInt16LittleEndian(
                        temporary.AsSpan(at, 2)) / 32768.0f;
                }
                sum += float.IsFinite(sample) ? sample : 0;
            }
            target[offset + frame] = Math.Clamp((float)(sum / channels), -1f, 1f);
        }
        return frames;
    }
}

internal static class Program
{
    const int SampleRate = 16000;
    const int ChunkDurationMs = 200;
    const int SamplesPerChunk = SampleRate * ChunkDurationMs / 1000;
    private static volatile bool stopRequested;

    private static void Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--self-test")
        {
            WriteTestTone();
            return;
        }

        if (args.Length != 4 ||
            args[0] != "--sample-rate" || args[1] != "16000" ||
            args[2] != "--chunk-duration" || args[3] != "0.2")
        {
            Console.Error.WriteLine("Expected 16kHz mono loopback request.");
            Environment.ExitCode = 2;
            return;
        }

        if (!OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine("WASAPI requires Windows.");
            Environment.ExitCode = 2;
            return;
        }

        Console.CancelKeyPress += (_, e) =>
        {
            stopRequested = true;
            e.Cancel = true;
        };

        try
        {
#pragma warning disable CS0618 // Used for compatibility with NAudio 2.2.1
            using var capture = new WasapiLoopbackCapture();
#pragma warning restore CS0618
            var buffered = new BufferedWaveProvider(capture.WaveFormat)
            {
                BufferDuration = TimeSpan.FromSeconds(3),
                DiscardOnBufferOverflow = true,
                ReadFully = true
            };
            var mono = new SystemMixToMono(buffered);
            var resampled = new WdlResamplingSampleProvider(mono, SampleRate);
            capture.DataAvailable += (_, data) =>
            {
                try
                {
                    buffered.AddSamples(data.Buffer, 0, data.BytesRecorded);
                }
                catch
                {
                    stopRequested = true;
                }
            };
            capture.RecordingStopped += (_, e) =>
            {
                stopRequested = true;
            };
            using var stdout = Console.OpenStandardOutput();
            capture.StartRecording();

            var samples = new float[SamplesPerChunk];
            var pcm = new byte[SamplesPerChunk * sizeof(short)];
            long ticksPerFrame = Stopwatch.Frequency * ChunkDurationMs / 1000;
            var clock = Stopwatch.StartNew();
            long ticksNext = ticksPerFrame;
            while (!stopRequested)
            {
                int count = resampled.Read(samples, 0, SamplesPerChunk);
                for (int i = 0; i < SamplesPerChunk; i++)
                {
                    float value = i < count ? samples[i] : 0f;
                    if (!float.IsFinite(value)) value = 0;
                    short quantized = (short)Math.Round(
                        Math.Clamp(value, -1f, 0.9999695f) * 32768f);
                    BinaryPrimitives.WriteInt16LittleEndian(
                        pcm.AsSpan(i * sizeof(short), sizeof(short)), quantized);
                }
                stdout.Write(pcm, 0, pcm.Length);
                stdout.Flush();

                long remaining = ticksNext - clock.ElapsedTicks;
                if (remaining > 0)
                {
                    int delay = (int)(remaining * 1000 / Stopwatch.Frequency);
                    if (delay > 0) Thread.Sleep(delay);
                }
                ticksNext += ticksPerFrame;
                if (ticksNext < clock.ElapsedTicks - ticksPerFrame)
                    ticksNext = clock.ElapsedTicks + ticksPerFrame;
            }
            capture.StopRecording();
        }
        catch (IOException)
        {
            // Parent application ended its capture pipe.
        }
        catch (Exception error)
        {
            // Never emit raw device paths or audio content.
            Console.Error.WriteLine("WASAPI loopback unavailable: " +
                                    error.GetType().Name);
            Environment.ExitCode = 3;
        }
    }

    private static void WriteTestTone()
    {
        using var output = Console.OpenStandardOutput();
        var pcm = new byte[SamplesPerChunk * sizeof(short)];
        for (int i = 0; i < SamplesPerChunk; i++)
        {
            float wave = MathF.Sin(2f * MathF.PI * 440f * i / SampleRate);
            short quantized = (short)(MathF.Round(wave * 8000f));
            BinaryPrimitives.WriteInt16LittleEndian(
                pcm.AsSpan(i * sizeof(short), sizeof(short)), quantized);
        }
        output.Write(pcm, 0, pcm.Length);
        output.Flush();
    }
}
