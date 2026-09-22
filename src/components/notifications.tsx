'use client';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { api, date, pretty, useApi } from '@/lib/client';
import { ActionButton, Badge, Empty, ErrorBox, Loading } from './ui';

type Notification = { id:string;type:string;title:string;message:string;actionUrl?:string|null;readAt?:string|null;createdAt:string };
export function NotificationScreen() {
  const {data,error,refresh}=useApi<{notifications:Notification[]}>('notifications',30000);
  const unread=data?.notifications.filter(item=>!item.readAt).length||0;
  return <div className="management-page"><div className="page-heading management-heading"><div><span className="eyebrow">Internal</span><h1>Notifications</h1><p>{unread} unread notification{unread===1?'':'s'}.</p></div>{unread>0&&<ActionButton action={()=>api('notifications',{all:true})} onDone={refresh}><CheckCheck size={17}/> Mark all read</ActionButton>}</div><ErrorBox message={error}/>{!data?<Loading/>:data.notifications.length?<div className="notification-list">{data.notifications.map(item=><article className={`notification-card ${item.readAt?'':'unread'}`} key={item.id}><div className="notification-icon"><Bell size={18}/></div><div><div className="tag-row"><Badge value={pretty(item.type)}/><small>{date(item.createdAt)}</small></div><h2>{item.title}</h2><p>{item.message}</p><div className="button-row">{item.actionUrl&&<Link className="button small-button" href={item.actionUrl} onClick={()=>{if(!item.readAt)void api('notifications',{id:item.id})}}>Open</Link>}<ActionButton className="small-button" action={()=>api('notifications',{id:item.id,unread:Boolean(item.readAt)})} onDone={refresh}>{item.readAt?'Mark unread':'Mark read'}</ActionButton></div></div></article>)}</div>:<Empty title="Inbox clear">Useful assignments and project actions will appear here.</Empty>}</div>;
}
