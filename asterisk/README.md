# Asterisk Configuration for AI Call Intake System

This directory contains Asterisk configuration files for the AI-powered 102 service call intake system.

## Files

- `asterisk.conf` - Main Asterisk configuration
- `sip.conf` - SIP trunk and endpoint configuration
- `extensions.conf` - Dialplan for call routing and AGI integration
- `modules.conf` (optional) - Module loading configuration
- `logger.conf` (optional) - Logging configuration

## Installation

1. Install Asterisk 18+ on Ubuntu 22.04:

```bash
sudo apt update
sudo apt install asterisk asterisk-dev
```

2. Copy configuration files to `/etc/asterisk/`:

```bash
sudo cp asterisk/config/*.conf /etc/asterisk/
```

3. Create necessary directories:

```bash
sudo mkdir -p /var/spool/asterisk/monitor
sudo mkdir -p /opt/ai-call-intake/agi
sudo chown -R asterisk:asterisk /var/spool/asterisk /opt/ai-call-intake
```

4. Configure SIP trunk:

   - Edit `/etc/asterisk/sip.conf` and update `[provider-trunk]` section with your SIP provider details
   - Or use `[softphone]` for testing with softphones

5. Set Python AGI script path:

   - Edit `/etc/asterisk/extensions.conf` and update `AI_SCRIPT_PATH` in `[globals]` section
   - Default: `/opt/ai-call-intake/agi/call_handler.py`

6. Restart Asterisk:

```bash
sudo systemctl restart asterisk
```

## Testing

### Internal Test Extensions

- Dial `500` from a registered SIP phone: Full AI call simulation
- Dial `501`: Direct AGI test (no audio)
- Dial `502`: Manual recording test
- Dial `600`: System status
- Dial `601`: List recent recordings

### SIP Registration Test

```bash
sudo asterisk -rvvv
sip show peers
sip show registry
core show channels
```

### AGI Debugging

Enable AGI debugging in `asterisk.conf`:

```
[agi]
debug=yes
```

View AGI logs:

```bash
tail -f /var/log/asterisk/agi
```

## Call Flow

1. Incoming call matches pattern in `[incoming]` context
2. Call is answered automatically
3. Recording starts (`Monitor`)
4. AGI script `call_handler.py` is executed with parameters:
   - `argv[1]` = Caller ID
   - `argv[2]` = Language (ru/kk)
5. AGI script handles:
   - Playing greeting (TTS)
   - Recording user response
   - STT processing
   - LLM classification
   - TTS response generation
   - Playing response
6. Call ends with goodbye message

## Security Considerations

1. **Firewall**: Open UDP 5060 (SIP) and RTP ports (10000-20000)
2. **Authentication**: Use strong secrets in `sip.conf`
3. **File Permissions**: Ensure recordings directory is not world-readable
4. **Rate Limiting**: Consider `fail2ban` for SIP brute force protection
5. **Network Isolation**: Run Asterisk in DMZ if exposed to internet

## Troubleshooting

### No Audio

- Check RTP ports are open
- Verify codec negotiation (`sip show channels`)
- Check NAT settings in `sip.conf`

### AGI Script Not Executing

- Verify script permissions (`chmod +x`)
- Check Asterisk user can execute Python
- View AGI debug logs

### SIP Registration Failed

- Check credentials in `sip.conf`
- Verify network connectivity to SIP provider
- Check firewall rules

## Integration with Python Backend

The AGI script communicates with the Python backend via:

1. Environment variables for API endpoints
2. Local socket or HTTP requests
3. Shared database for logging

See `../agi/` directory for the Python AGI implementation.
