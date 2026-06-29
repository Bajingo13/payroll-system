module.exports = function registerReportBuilderRoutes(app, pool) {
  const SOURCES = {
    employees: {
      label: 'Employee Masterlist', category: 'HRIS', dateField: 'ee.date_hired',
      from: `employees e LEFT JOIN employee_employment ee ON ee.employee_id=e.employee_id LEFT JOIN employee_accounts ea ON ea.employee_id=e.employee_id`,
      fields: {
        emp_code: ['Employee Code', 'e.emp_code', 'text'], employee_name: ['Employee Name', "CONCAT(e.last_name, ', ', e.first_name, IF(e.middle_name IS NULL OR e.middle_name='', '', CONCAT(' ',e.middle_name)))", 'text'],
        status: ['Status', 'e.status', 'text'], gender: ['Gender', 'e.gender', 'text'], birth_date: ['Birth Date', 'e.birth_date', 'date'],
        company: ['Company', 'ee.company', 'text'], department: ['Department', 'ee.department', 'text'], position: ['Position', 'ee.position', 'text'], date_hired: ['Date Hired', 'ee.date_hired', 'date'],
        sss_no: ['SSS Number', 'ea.sss_no', 'sensitive'], philhealth_no: ['PhilHealth Number', 'ea.philhealth_no', 'sensitive'], pagibig_no: ['Pag-IBIG MID', 'ea.pagibig_no', 'sensitive'], tin_no: ['TIN', 'ea.tin_no', 'sensitive']
      }
    },
    payroll: {
      label: 'Payroll Register', category: 'Payroll', dateField: 'pr.date_created',
      from: `employee_payroll ep INNER JOIN payroll_runs pr ON pr.run_id=ep.run_id INNER JOIN employees e ON e.employee_id=ep.employee_id LEFT JOIN employee_employment ee ON ee.employee_id=e.employee_id`,
      fields: {
        run_id: ['Run ID', 'ep.run_id', 'number'], payroll_range: ['Payroll Period', 'pr.payroll_range', 'text'], emp_code: ['Employee Code', 'e.emp_code', 'text'], employee_name: ['Employee Name', "CONCAT(e.last_name, ', ', e.first_name)", 'text'], company: ['Company', 'ee.company', 'text'], department: ['Department', 'ee.department', 'text'],
        basic_salary: ['Basic Salary', 'ep.basic_salary', 'money'], overtime: ['Overtime', 'ep.overtime', 'money'], holiday_pay: ['Holiday Pay', 'ep.holiday_pay', 'money'], taxable_allowances: ['Taxable Allowances', 'ep.taxable_allowances', 'money'], non_taxable_allowances: ['Non-taxable Allowances', 'ep.non_taxable_allowances', 'money'], gross_pay: ['Gross Pay', 'ep.gross_pay', 'money'], deductions: ['Deductions', 'ep.total_deductions', 'money'], tax_withheld: ['Tax Withheld', 'ep.tax_withheld', 'money'], sss: ['SSS Employee', 'ep.sss_employee', 'money'], philhealth: ['PhilHealth Employee', 'ep.philhealth_employee', 'money'], pagibig: ['Pag-IBIG Employee', 'ep.pagibig_employee', 'money'], net_pay: ['Net Pay', 'ep.net_pay', 'money'], status: ['Payroll Status', 'ep.payroll_status', 'text']
      }
    },
    attendance: {
      label: 'Attendance Detail', category: 'Timekeeping', dateField: 'a.attendance_date',
      from: `(SELECT user_id, DATE(log_time) attendance_date,
               MIN(CASE WHEN action='Employee Time In' THEN log_time END) time_in,
               MAX(CASE WHEN action='Employee Time Out' THEN log_time END) time_out
             FROM audit_logs
             WHERE action IN ('Employee Time In','Employee Time Out')
             GROUP BY user_id, DATE(log_time)) a
             INNER JOIN users u ON u.user_id=a.user_id
             LEFT JOIN employees e ON LOWER(TRIM(e.emp_code))=LOWER(TRIM(u.username))
                OR LOWER(TRIM(CONCAT(e.first_name,' ',e.last_name)))=LOWER(TRIM(u.full_name))
             LEFT JOIN employee_employment ee ON ee.employee_id=e.employee_id
             LEFT JOIN employee_payroll_settings eps ON eps.employee_id=e.employee_id`,
      fields: { attendance_date: ['Date', 'a.attendance_date', 'date'], emp_code: ['Employee Code', "COALESCE(e.emp_code,u.username)", 'text'], employee_name: ['Employee Name', "COALESCE(CONCAT(e.last_name, ', ', e.first_name),u.full_name)", 'text'], department: ['Department', 'ee.department', 'text'], time_in: ['Time In', 'a.time_in', 'text'], time_out: ['Time Out', 'a.time_out', 'text'], late_minutes: ['Late Minutes', "CASE WHEN a.time_in IS NULL THEN 0 ELSE GREATEST(TIMESTAMPDIFF(MINUTE,CONCAT(a.attendance_date,' ',COALESCE(eps.time_in,'08:00')),a.time_in),0) END", 'number'], undertime_minutes: ['Undertime Minutes', "CASE WHEN a.time_in IS NULL OR a.time_out IS NULL THEN 0 ELSE GREATEST(TIMESTAMPDIFF(MINUTE,a.time_out,DATE_ADD(a.time_in,INTERVAL COALESCE(eps.hours_in_day,8) HOUR)),0) END", 'number'], overtime_hours: ['OT Hours', "CASE WHEN a.time_in IS NULL OR a.time_out IS NULL THEN 0 ELSE ROUND(GREATEST(TIMESTAMPDIFF(MINUTE,DATE_ADD(a.time_in,INTERVAL COALESCE(eps.hours_in_day,8) HOUR),a.time_out),0)/60,2) END", 'number'], status: ['Status', "CASE WHEN a.time_in IS NULL THEN 'Absent' WHEN a.time_out IS NULL THEN 'Incomplete' ELSE 'Present' END", 'text'] }
    },
    leave: {
      label: 'Leave Requests', category: 'HRIS', dateField: 'lr.start_date',
      from: `employee_leave_requests lr INNER JOIN employees e ON e.employee_id=lr.employee_id LEFT JOIN employee_employment ee ON ee.employee_id=e.employee_id LEFT JOIN leave_types lt ON lt.leave_type_id=lr.leave_type_id`,
      fields: { request_id: ['Request ID', 'lr.request_id', 'number'], emp_code: ['Employee Code', 'e.emp_code', 'text'], employee_name: ['Employee Name', "CONCAT(e.last_name, ', ', e.first_name)", 'text'], department: ['Department', 'ee.department', 'text'], leave_type: ['Leave Type', 'lt.leave_name', 'text'], start_date: ['Start Date', 'lr.start_date', 'date'], end_date: ['End Date', 'lr.end_date', 'date'], total_days: ['Days', 'lr.total_days', 'number'], reason: ['Reason', 'lr.reason', 'text'], status: ['Status', 'lr.status', 'text'] }
    },
    overtime: {
      label: 'Overtime Requests', category: 'Timekeeping', dateField: 'ot.overtime_date',
      from: `employee_overtime_requests ot INNER JOIN employees e ON e.employee_id=ot.employee_id LEFT JOIN employee_employment ee ON ee.employee_id=e.employee_id`,
      fields: { overtime_date: ['Date', 'ot.overtime_date', 'date'], emp_code: ['Employee Code', 'e.emp_code', 'text'], employee_name: ['Employee Name', "CONCAT(e.last_name, ', ', e.first_name)", 'text'], department: ['Department', 'ee.department', 'text'], start_time: ['Start Time', 'ot.start_time', 'text'], end_time: ['End Time', 'ot.end_time', 'text'], total_hours: ['Hours', 'ot.total_hours', 'number'], reason: ['Reason', 'ot.reason', 'text'], status: ['Status', 'ot.status', 'text'] }
    }
  };

  async function ensureTables(conn) {
    await conn.query(`CREATE TABLE IF NOT EXISTS report_builder_templates (
      template_id INT AUTO_INCREMENT PRIMARY KEY, template_name VARCHAR(150) NOT NULL, description TEXT NULL,
      source_key VARCHAR(40) NOT NULL, configuration_json JSON NOT NULL, created_by VARCHAR(150) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
  const actor = (req) => String(req.session?.user?.full_name || 'System User');
  const mask = (value) => { const s=String(value||''); return s.length > 4 ? `${'*'.repeat(Math.max(4,s.length-4))}${s.slice(-4)}` : (s ? '****' : ''); };

  app.get('/api/report-builder/metadata', (req,res) => res.json({ success:true, sources:Object.entries(SOURCES).map(([key,s]) => ({ key,label:s.label,category:s.category,fields:Object.entries(s.fields).map(([field,[label,,type]]) => ({ field,label,type })) })) }));

  app.post('/api/report-builder/preview', async (req,res) => {
    const source=SOURCES[req.body?.source]; if(!source) return res.status(400).json({success:false,message:'Invalid data source.'});
    const requested=(Array.isArray(req.body.fields)?req.body.fields:[]).filter(f=>source.fields[f]);
    const fields=requested.length?requested:Object.keys(source.fields).slice(0,8); if(fields.length>20) return res.status(400).json({success:false,message:'Select at most 20 fields.'});
    const where=[], params=[], filters=req.body.filters||{};
    if(filters.date_from){where.push(`${source.dateField} >= ?`);params.push(filters.date_from);} if(filters.date_to){where.push(`${source.dateField} <= ?`);params.push(filters.date_to);}
    if(filters.department && source.fields.department){where.push(`TRIM(ee.department)=TRIM(?)`);params.push(filters.department);}
    if(filters.company && source.fields.company){where.push(`TRIM(ee.company)=TRIM(?)`);params.push(filters.company);}
    if(filters.status && source.fields.status){where.push(`${source.fields.status[1]}=?`);params.push(filters.status);}
    if(filters.run_id && req.body.source==='payroll'){where.push('ep.run_id=?');params.push(Number(filters.run_id));}
    const sortField=source.fields[req.body.sort_field]?req.body.sort_field:fields[0]; const sortDir=String(req.body.sort_dir).toUpperCase()==='DESC'?'DESC':'ASC';
    const conn=await pool.getConnection(); try {
      const select=fields.map(f=>`${source.fields[f][1]} AS \`${f}\``).join(', ');
      const [rows]=await conn.query(`SELECT ${select} FROM ${source.from} ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY ${source.fields[sortField][1]} ${sortDir} LIMIT 2000`,params);
      const canSeeSensitive=String(req.session?.user?.role||'').toLowerCase().includes('admin');
      const data=rows.map(row=>Object.fromEntries(fields.map(f=>[f,source.fields[f][2]==='sensitive'&&!canSeeSensitive?mask(row[f]):row[f]])));
      const numeric=fields.filter(f=>['money','number'].includes(source.fields[f][2])); const totals={}; numeric.forEach(f=>totals[f]=data.reduce((n,r)=>n+Number(r[f]||0),0));
      const groupField=source.fields[req.body.group_by]?req.body.group_by:''; let groups=[];
      if(groupField){const map=new Map();data.forEach(r=>{const k=String(r[groupField]??'Unassigned');if(!map.has(k))map.set(k,{group:k,count:0});const g=map.get(k);g.count++;numeric.forEach(f=>g[f]=(g[f]||0)+Number(r[f]||0));});groups=[...map.values()];}
      res.json({success:true,source:req.body.source,columns:fields.map(f=>({field:f,label:source.fields[f][0],type:source.fields[f][2]})),data,totals,groups,count:data.length,truncated:rows.length===2000});
    } catch(err){console.error('Report builder preview:',err);res.status(500).json({success:false,message:`Unable to build report: ${err.message}`});} finally{conn.release();}
  });

  app.get('/api/report-builder/templates', async(req,res)=>{const conn=await pool.getConnection();try{await ensureTables(conn);const [rows]=await conn.query('SELECT * FROM report_builder_templates ORDER BY updated_at DESC');res.json({success:true,data:rows.map(r=>({...r,configuration:typeof r.configuration_json==='string'?JSON.parse(r.configuration_json):r.configuration_json}))});}finally{conn.release();}});
  app.post('/api/report-builder/templates', async(req,res)=>{const name=String(req.body?.template_name||'').trim(), source=String(req.body?.configuration?.source||'');if(!name||!SOURCES[source])return res.status(400).json({success:false,message:'Template name and valid source are required.'});const conn=await pool.getConnection();try{await ensureTables(conn);const [r]=await conn.query('INSERT INTO report_builder_templates (template_name,description,source_key,configuration_json,created_by) VALUES (?,?,?,?,?)',[name,String(req.body.description||''),source,JSON.stringify(req.body.configuration),actor(req)]);res.json({success:true,template_id:r.insertId});}finally{conn.release();}});
  app.delete('/api/report-builder/templates/:id',async(req,res)=>{const conn=await pool.getConnection();try{await ensureTables(conn);await conn.query('DELETE FROM report_builder_templates WHERE template_id=?',[Number(req.params.id)]);res.json({success:true});}finally{conn.release();}});
};
