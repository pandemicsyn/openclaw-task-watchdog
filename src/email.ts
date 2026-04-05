import { render } from "@react-email/render";
import React from "react";
import nodemailer from "nodemailer";
import { Resend } from "resend";

import type { DetachedWorkAlertEvent, DetachedWorkEmailSender } from "./types.js";

export type DetachedWorkEmailRenderInput = {
  event: DetachedWorkAlertEvent;
  subjectPrefix?: string;
};

function AlertEmail(props: { event: DetachedWorkAlertEvent }): React.ReactElement {
  const { event } = props;
  return React.createElement(
    "html",
    null,
    React.createElement(
      "body",
      { style: { fontFamily: "ui-sans-serif, system-ui", lineHeight: "1.5" } },
      React.createElement("h2", null, `Detached Work Health — ${event.severity.toUpperCase()}`),
      React.createElement("p", null, `${event.runtime} ${event.eventType}`),
      React.createElement("p", null, event.summary),
      React.createElement("ul", null,
        React.createElement("li", null, `Task ID: ${event.taskId}`),
        React.createElement("li", null, `Status: ${event.task.status}`),
        React.createElement("li", null, `Delivery: ${event.task.deliveryStatus}`),
      ),
      event.detail ? React.createElement("p", null, `Detail: ${event.detail}`) : null,
    ),
  );
}

export async function renderAlertEmail(input: DetachedWorkEmailRenderInput): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { event, subjectPrefix } = input;
  const prefix = subjectPrefix ?? "[Detached Work Health]";
  const subject = `${prefix} ${event.severity.toUpperCase()} ${event.runtime} ${event.eventType}`;
  const html = await render(React.createElement(AlertEmail, { event }));
  const text = [
    `${event.severity.toUpperCase()} ${event.runtime} ${event.eventType}`,
    event.summary,
    `Task ID: ${event.taskId}`,
    `Status: ${event.task.status}`,
    `Delivery: ${event.task.deliveryStatus}`,
    event.detail ? `Detail: ${event.detail}` : undefined,
  ]
    .filter((line): line is string => !!line)
    .join("\n");

  return { subject, html, text };
}

export type ResendProviderConfig = {
  apiKey: string;
  defaultFrom: string;
};

export type NodemailerProviderConfig = {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  defaultFrom: string;
};

export class ProviderBackedEmailSender implements DetachedWorkEmailSender {
  private readonly resend?: Resend;
  private readonly nodemailerTransport?: nodemailer.Transporter;

  constructor(
    private readonly providers: {
      resend?: ResendProviderConfig;
      nodemailer?: NodemailerProviderConfig;
    },
  ) {
    if (providers.resend) {
      this.resend = new Resend(providers.resend.apiKey);
    }

    if (providers.nodemailer) {
      const cfg = providers.nodemailer;
      this.nodemailerTransport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure ?? false,
        auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
      });
    }
  }

  public async send(input: {
    provider: "resend" | "nodemailer";
    to: string[];
    from?: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    if (input.provider === "resend") {
      if (!this.resend || !this.providers.resend) {
        throw new Error("Resend provider is not configured");
      }

      await this.resend.emails.send({
        from: input.from ?? this.providers.resend.defaultFrom,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      });
      return;
    }

    if (!this.nodemailerTransport || !this.providers.nodemailer) {
      throw new Error("Nodemailer provider is not configured");
    }

    await this.nodemailerTransport.sendMail({
      from: input.from ?? this.providers.nodemailer.defaultFrom,
      to: input.to.join(", "),
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    });
  }
}
