#!/bin/bash

pnpm install

pnpm build

pnpm pm2:restart