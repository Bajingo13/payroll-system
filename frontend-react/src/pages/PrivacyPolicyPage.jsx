import React from 'react';
import './PrivacyPolicyPage.css';

const PrivacyPolicyPage = () => {
  return (
    <div className="privacy-policy-container">
      <div className="privacy-policy-content">
        <h1>Privacy Policy - Astreablue Payroll System</h1>
        <p className="last-updated"><strong>Last Updated: July 1, 2026</strong></p>

        <section>
          <h2>Overview</h2>
          <p>
            Astreablue Payroll System ("App") is committed to protecting your privacy. This Privacy Policy explains 
            how we collect, use, and protect your information.
          </p>
        </section>

        <section>
          <h2>Information We Collect</h2>
          
          <h3>Employee Information</h3>
          <ul>
            <li>Employee ID and name</li>
            <li>Location data (for attendance verification)</li>
            <li>Camera data (facial recognition for attendance)</li>
            <li>Bank account and ATM information</li>
            <li>Payroll and compensation data</li>
            <li>Contact information</li>
            <li>Government identification numbers (SSS, TIN, etc.)</li>
          </ul>

          <h3>Device Information</h3>
          <ul>
            <li>Device type and OS version</li>
            <li>App usage analytics</li>
            <li>Crash reports</li>
          </ul>
        </section>

        <section>
          <h2>How We Use Your Information</h2>
          <ol>
            <li><strong>Attendance Tracking</strong> - Your location and face data is used to verify attendance</li>
            <li><strong>Payroll Processing</strong> - Your personal and financial data is used to calculate and process salary payments</li>
            <li><strong>Reporting</strong> - Data is used for government compliance reports (SSS, PhilHealth, PagIBIG, BIR)</li>
            <li><strong>Bank Transfers</strong> - Your bank account information is used for direct salary deposits (BPI, BDO)</li>
            <li><strong>Analytics</strong> - Aggregate data helps us improve the app</li>
          </ol>
        </section>

        <section>
          <h2>Data Security</h2>
          <ul>
            <li>All data is transmitted over encrypted HTTPS connections</li>
            <li>Sensitive data (SSS numbers, TIN) are encrypted at rest</li>
            <li>File storage uses Cloudflare R2 with encryption and access controls</li>
            <li>Access is restricted to authorized personnel only</li>
            <li>Regular security audits are conducted</li>
          </ul>
        </section>

        <section>
          <h2>Data Storage</h2>
          <ul>
            <li>Employee data is stored securely in our MySQL database</li>
            <li>Backups are maintained for disaster recovery</li>
            <li>Data is retained only as long as legally required</li>
          </ul>
        </section>

        <section>
          <h2>Your Rights</h2>
          <ul>
            <li>You can request access to your personal data</li>
            <li>You can request correction of inaccurate data</li>
            <li>You can request deletion of your data (subject to legal requirements)</li>
            <li>Contact us at: support@astreablue.com</li>
          </ul>
        </section>

        <section>
          <h2>Third-Party Services</h2>
          <p>We use the following third-party services:</p>
          <ul>
            <li><strong>Railway.app</strong> - Backend hosting</li>
            <li><strong>Cloudflare R2</strong> - Secure cloud storage for documents and file backups</li>
            <li><strong>Expo</strong> - Mobile app distribution</li>
            <li><strong>Google Play Store</strong> - App store hosting</li>
          </ul>
        </section>

        <section>
          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy periodically. Continued use of the app constitutes acceptance of changes.
          </p>
        </section>

        <section>
          <h2>Contact Us</h2>
          <p>For privacy questions or concerns:</p>
          <ul>
            <li>Email: hris@astreablue.com</li>
            <li>Company: Astreablue</li>
            <li>Website: https://www.astreablue.com</li>
          </ul>
        </section>

        <div className="footer-note">
          <p>© 2026 Astreablue. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
