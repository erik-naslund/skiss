# glossary

The Bite Platform as the release meeting talks about it: the environments, what is published to them, and who owns which word.

## Environment

System: Platform. One installation of the Bite Platform, with its own data.

| Field | Type | Description |
|---|---|---|
| id | identifier | |
| name | | dev, integration, preview, prod ... not a fixed set |
| purpose | build / test / playtest / live | |

## Build

System: Pipeline. The zip the pipeline produces, one per commit that passes the gate.

| Field | Type | Description |
|---|---|---|
| id | identifier | |
| commit | | the git SHA it was built from |
| environment | [Environment](#environment) | app and web point at the same environment |
| publishedTo | list of [Environment](#environment) | the same zip can be published to any environment |
| sizeInMb | int | as the packer reports it, after compression. System: Telemetry. |

## Release

Extends Build. A build the release manager has signed off.

| Field | Type | Description |
|---|---|---|
| channel | internal / closed / open | |

## Changelog

System: Docs. Similar to Build.

| Field | Type | Description |
|---|---|---|
| slug | identifier | |
| buildId | | Joins to Build.id. |
| author | Person | |
| body | | |

## Award

| Field | Type | Description |
|---|---|---|
| code | identifier, int | |
| name | | what the jury called it |
