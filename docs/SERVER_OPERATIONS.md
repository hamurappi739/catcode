# CatCode License Server Operations

## Backups

The VPS backup job uses the administrator connection from `.migration.env`, validates Supabase TLS, writes a compressed PostgreSQL custom dump, and removes local dumps older than the configured retention period. It never reads the public API `.env` signing key.

Before enabling the timer, create a private offsite destination with encryption enabled at the storage provider. Configure it through `rclone`, then create `/home/catcode/catcode-license-server/.backup.env` from [`.backup.env.example`](../license-server/.backup.env.example):

```bash
cd /home/catcode/catcode-license-server
cp .backup.env.example .backup.env
nano .backup.env
chmod 600 .backup.env
```

Set `BACKUP_RCLONE_REMOTE` to the configured encrypted rclone remote. Leave `REQUIRE_OFFSITE_BACKUP=true`; a local disk copy is useful only for short-term recovery and is not enough if the VPS is lost.

Test it manually before scheduling:

```bash
sudo bash scripts/backup-database.sh
ls -lh backups/
```

## Monitoring

For failure notifications, create a private check at a monitoring service such as Healthchecks.io and place its ping URL in `.monitor.env` with mode `600`. The health job checks public HTTPS `/healthz` and Docker's internal health state every five minutes. A failed check pings the service's `/fail` endpoint.

## systemd timers

Install the service units after copying the current server source to the VPS:

```bash
cd /home/catcode/catcode-license-server
chmod 700 scripts/backup-database.sh scripts/healthcheck.sh
sudo cp deploy/systemd/catcode-license-*.service /etc/systemd/system/
sudo cp deploy/systemd/catcode-license-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now catcode-license-backup.timer catcode-license-healthcheck.timer
systemctl list-timers 'catcode-license-*'
```

Inspect the last run with:

```bash
sudo systemctl status catcode-license-backup.service
sudo systemctl status catcode-license-healthcheck.service
sudo journalctl -u catcode-license-healthcheck.service --since today
```

## Restore drill

Do not restore into the live production project. Once per quarter, create an isolated PostgreSQL database, restore a selected dump there with `pg_restore --clean --if-exists`, and check that the expected `licenses`, `devices`, and `schema_migrations` rows exist. Record the date and result privately.
