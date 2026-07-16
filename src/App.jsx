import React, { useState, useEffect, useRef } from 'react';
import { 
    BookOpen, HelpCircle, Brain, LayoutDashboard, FileText, Send, 
    Loader2, ChevronRight, ChevronLeft, RefreshCw, Plus, CheckCircle, 
    XCircle, AlertCircle, BarChart3, MessageSquare, Calendar, Settings,
    Sun, Moon, Map, CheckSquare, Square, PlayCircle, Cloud,
    Info, ExternalLink, Key, Trash2, User, Bot, Sparkles, Clock
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- Configuration ---
// プレビュー環境では自動的に提供されます。個人のAPIキーを設定画面から入力できます。
const fallbackApiKey = ""; 
const isCanvasEnv = typeof __app_id !== 'undefined';
const getModelText = (key) => key ? "gemini-1.5-flash";

// --- Firebase Init ---
let app, auth, db, appId;
try {
    const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    if (configStr) {
        // プレビュー環境での自動設定
        app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    } else {
        // ローカル環境・Vercel用の設定（Viteの環境変数を使用）
        // ※Canvasプレビュー環境でもエラーが出ないように安全に取得しています
        const getEnv = (name) => {
            try {
                if (typeof import.meta !== 'undefined' && import.meta.env) {
                    return import.meta.env[name];
                }
            } catch (e) {}
            return undefined;
        };

        const firebaseConfig = {
            apiKey: getEnv('VITE_FIREBASE_API_KEY'),
            authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
            projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
            storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
            messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
            appId: getEnv('VITE_FIREBASE_APP_ID')
        };
        
        // 値が設定されている場合のみ初期化を実行する（エラー回避）
        if (firebaseConfig.apiKey) {
            app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
            appId = firebaseConfig.projectId || "aws-clf-dashboard";
        }
    }
} catch (e) {
    console.error("Firebase init error:", e);
}

// --- API Helpers ---
async function fetchWithRetry(url, options, maxRetries = 5) {
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(res => setTimeout(res, delays[i]));
        }
    }
}

const DOMAINS = [
    "第1分野: クラウドのコンセプト",
    "第2分野: セキュリティとコンプライアンス",
    "第3分野: クラウドテクノロジーとサービス",
    "第4分野: 請求、料金、サポート"
];

// --- Task Statements Data ---
const TASKS_BY_DOMAIN = {
    "第1分野: クラウドのコンセプト": [
        { id: "1.1", title: "1.1: AWS クラウドの利点を定義する" },
        { id: "1.2", title: "1.2: AWS クラウドの設計原則を特定する" },
        { id: "1.3", title: "1.3: クラウドへの移行の利点と戦略を理解する" },
        { id: "1.4", title: "1.4: クラウドエコノミクスのコンセプトを理解する" }
    ],
    "第2分野: セキュリティとコンプライアンス": [
        { id: "2.1", title: "2.1: AWS の責任共有モデルを理解する" },
        { id: "2.2", title: "2.2: セキュリティ、ガバナンス、コンプライアンスのコンセプト" },
        { id: "2.3", title: "2.3: AWS アクセス管理機能を特定する" },
        { id: "2.4", title: "2.4: セキュリティのためのコンポーネントとリソースを特定する" }
    ],
    "第3分野: クラウドテクノロジーとサービス": [
        { id: "3.1", title: "3.1: クラウドでのデプロイと運用の方法を定義する" },
        { id: "3.2", title: "3.2: AWS のグローバルインフラストラクチャを定義する" },
        { id: "3.3", title: "3.3: AWS のコンピューティングサービスを特定する" },
        { id: "3.4", title: "3.4: AWS のデータベースサービスを特定する" },
        { id: "3.5", title: "3.5: AWS のネットワークサービスを特定する" },
        { id: "3.6", title: "3.6: AWS のストレージサービスを特定する" },
        { id: "3.7", title: "3.7: AI/ML サービスと分析サービスを特定する" },
        { id: "3.8", title: "3.8: その他の範囲内の AWS サービスカテゴリを特定する" }
    ],
    "第4分野: 請求、料金、サポート": [
        { id: "4.1", title: "4.1: AWS の料金モデルを比較する" },
        { id: "4.2", title: "4.2: 請求、予算、コスト管理のためのリソースを理解する" },
        { id: "4.3", title: "4.3: AWSの技術リソースとサポートオプションを特定する" }
    ]
};

// --- Initial Data ---
const INITIAL_QUIZZES = [];

// --- 超・大幅拡充された単語カードデータ（約80枚） ---
const FLASHCARDS = [
    // --- 第1分野: クラウドのコンセプト ---
    { term: "AWS CAF (Cloud Adoption Framework)", domain: "第1分野: クラウドのコンセプト", beginnerDesc: "クラウドを会社に導入する時の「道しるべ」。ビジネス、人など6つの視点から、どう進めるべきか教えてくれるガイドライン。", intermediateDesc: "組織のデジタルトランスフォーメーション(DX)を加速させるためのフレームワーク。6つのパースペクティブ（ビジネス、ピープル、ガバナンス、プラットフォーム、セキュリティ、オペレーション）から構成されます。", examTip: "試験で「クラウドへの移行戦略」や「6つの視点（パースペクティブ）」というキーワードが出たら、AWS CAFが正解です。" },
    { term: "AWS Well-Architected Framework", domain: "第1分野: クラウドのコンセプト", beginnerDesc: "良いシステムを作るための「設計の教科書」。セキュリティ、コスト、性能など6つの柱から、ベストな作り方を教えてくれる。", intermediateDesc: "システム設計のベストプラクティス集。運用上の優秀性、セキュリティ、信頼性、パフォーマンス効率、コスト最適化、持続可能性の6つの柱で構成されます。", examTip: "「設計原則」や「6つの柱」「持続可能性（サステナビリティ）」に関する設問で問われます。CAF（導入ガイド）とのひっかけに注意。" },
    { term: "スケーラビリティ (拡張性)", domain: "第1分野: クラウドのコンセプト", beginnerDesc: "アクセスが増えたときに、サーバーの性能を上げたり、台数を増やしたりしてパンクを防ぐ能力。", intermediateDesc: "システムがトラフィックの増加に応じて柔軟にリソースを拡張・縮小できる能力。Auto ScalingやELBが関連します。", examTip: "「需要に応じてリソースを調整する」という文脈で出題されます。伸縮性（Elasticity）とほぼ同義で扱われることも多いです。" },
    { term: "伸縮性 (Elasticity)", domain: "第1分野: クラウドのコンセプト", beginnerDesc: "ゴムのように伸び縮みする性質のこと。アクセスが増えたら自動でサーバーを増やし、減ったら減らすことができるクラウドの強み。", intermediateDesc: "ワークロードの需要変化に応じて、必要なコンピューティングリソースを自動的に拡張(スケールアウト)または縮小(スケールイン)できるクラウドの特性です。", examTip: "「需要に合わせてリソースを自動的に増減させる」「無駄なリソースを削減する」というシナリオに対するクラウドの利点として選ばれます。" },
    { term: "俊敏性 (Agility)", domain: "第1分野: クラウドのコンセプト", beginnerDesc: "素早さのこと。必要な時にボタン一つで数分でサーバーを用意でき、新しいアイデアをすぐに試せるクラウドの強み。", intermediateDesc: "ITリソースを数週間ではなく数分でプロビジョニング（調達・構築）し、開発者が新しいアプリケーションを迅速に実験・展開できる利点です。", examTip: "「開発のスピードアップ」「新しいアイデアをすぐに実験できる」「リソース調達の時間を短縮」といった文脈で正解になります。" },
    { term: "高可用性 (HA) と 耐障害性 (FT)", domain: "第1分野: クラウドのコンセプト", beginnerDesc: "高可用性は「めったに止まらない（すぐ復旧する）」、耐障害性は「一部が壊れても絶対に止まらない」仕組みのこと。", intermediateDesc: "HA(High Availability)は障害発生時のダウンタイムを最小限に抑える設計。FT(Fault Tolerance)はコンポーネントが停止してもシステム全体の稼働を継続させる、より高度な冗長化設計です。", examTip: "「障害が起きても影響を受けずに（無停止で）稼働し続ける」なら耐障害性、「迅速に復旧する」なら高可用性が正解です。" },
    { term: "ディザスタリカバリ (DR)", domain: "第1分野: クラウドのコンセプト", beginnerDesc: "大地震などでデータセンターごとダメになった時に、別の場所（別のリージョン）でシステムを復活させる「災害対策」。", intermediateDesc: "自然災害や大規模障害時にビジネス継続性を確保するための災害対策。RTO（目標復旧時間）とRPO（目標復旧時点）に基づき、別リージョンに環境を準備します。", examTip: "「大規模な障害からの復旧」「リージョン全体が利用不可になった場合」の対策として問われます。" },
    { term: "設備投資 (CapEx) と 運用費 (OpEx)", domain: "第1分野: クラウドのコンセプト", beginnerDesc: "CapExは「最初にドカンと払うお金（自社サーバー購入など）」。OpExは「使った分だけ払うお金（電気代のようなクラウドの料金）」。", intermediateDesc: "オンプレミスのデータセンター構築に必要な多額の初期費用（CapEx）から、使用した分だけ支払うクラウドの従量課金モデル（OpEx）へ移行できる利点。", examTip: "「固定費を変動費に振り替える利点」や「事前の多額の投資を避ける」というクラウドエコノミクスの問題で頻出です。" },
    { term: "規模の経済", domain: "第1分野: クラウドのコンセプト", beginnerDesc: "AWSが世界中で大量にサーバーを仕入れているからこそ、私たちが安く使えるという仕組みのこと。", intermediateDesc: "AWSが数十万のお客様の利用を集約することで大規模な運用を実現し、その結果としてより低い従量課金料金をユーザーに提供できるメリット。", examTip: "「自社でインフラを運用するよりも安価になる理由」を問われた際、「スケールメリット」や「規模の経済」を選びます。" },

    // --- 第2分野: セキュリティとコンプライアンス ---
    { term: "AWS 責任共有モデル", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "「ここはAWSが守るから、ここはあなたが守ってね」という役割分担。AWSはデータセンターを、ユーザーはデータやパスワードを守る。", intermediateDesc: "セキュリティに関する責任分界点。AWSはインフラストラクチャ（クラウドのセキュリティ）を、ユーザーはデータやOS、IAM（クラウドにおけるセキュリティ）を管理します。", examTip: "「パッチ適用は誰の責任か？」という問題が頻出。EC2のOSパッチは『お客様』、RDSのOSパッチは『AWS』の責任です。" },
    { term: "IAM (Identity and Access Management)", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "「誰が、どのサービスを、どう使えるか」を管理する門番のようなサービス。", intermediateDesc: "AWSリソースへのアクセスを安全に制御するサービス。ユーザー、グループ、ロールに対してIAMポリシーをアタッチして権限を管理します。", examTip: "「AWSリソースへのアクセス制御」「ユーザーの認証と認可」と来たらIAMです。多要素認証(MFA)の設定もIAMで行います。" },
    { term: "AWS IAM Identity Center", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "複数のAWSアカウントやアプリへのログインを「1つのIDとパスワード」で済ませられるようにするサービス（旧AWS SSO）。", intermediateDesc: "SSO（シングルサインオン）を提供し、複数のAWSアカウントやビジネスアプリケーションへのアクセスを一元管理するサービス。", examTip: "「複数のアカウントへのシングルサインオン(SSO)」「複数アカウントのアクセス管理を簡素化」と来たらこれです。" },
    { term: "最小権限の原則", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "ユーザーには「仕事に必要な最低限の権限だけ」を渡すという、セキュリティの鉄則。", intermediateDesc: "ユーザーやプログラムに対して、許可されたタスクを実行するために必要な最小限の権限（ポリシー）のみを付与するベストプラクティス。", examTip: "「最も安全な権限管理の方法はどれか？」というシナリオで正答となる、超重要キーワードです。" },
    { term: "AWS CloudTrail", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "「いつ・誰が・何をしたか」という操作履歴（ログ）を監視カメラのように全て記録するサービス。", intermediateDesc: "AWSアカウントのガバナンス、コンプライアンス、運用監査を行うサービス。API呼び出しの履歴をすべて記録します。", examTip: "「APIの呼び出し履歴」「ユーザーのアクティビティを追跡・監査する」というキーワードが出たら100% CloudTrailです。" },
    { term: "AWS Config", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "設定変更の履歴を記録するサービス。「誰かが勝手に設定を変えていないか」をチェックしてくれる。", intermediateDesc: "AWSリソースの設定を評価、監査、審査するサービス。リソースの設定変更履歴を記録し、定義したルールへの準拠状況を確認します。", examTip: "「リソースの設定変更履歴」「コンプライアンス要件に準拠しているかの継続的な評価」と問われたらConfigです。" },
    { term: "AWS Control Tower", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "ルールを守った安全なAWS環境（複数のアカウント）を、ベストプラクティスに従って自動で立ち上げてくれるサービス。", intermediateDesc: "AWS組織全体のマルチアカウント環境を、セキュリティとガバナンスのベストプラクティスに基づいて簡単にセットアップし管理するサービス。", examTip: "「マルチアカウント環境のセットアップとガバナンス」「セキュアなベースラインの確立」がキーワード。" },
    { term: "セキュリティグループ と NACL", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "セキュリティグループはEC2（パソコン）の前の門番、NACLはVPC（敷地）の前の門番。役割が少し違う。", intermediateDesc: "セキュリティグループはインスタンスレベルで動作する「ステートフル（行きの許可で帰りも許可）」なファイアウォール。NACLはサブネットレベルで動作する「ステートレス（行き・帰り両方の設定が必要）」なファイアウォール。", examTip: "「ステートフルなファイアウォール」ならセキュリティグループ、「サブネットレベルのステートレス」ならNACLです。" },
    { term: "AWS WAF (Web Application Firewall)", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "Webサイトを悪意ある攻撃から守ってくれる盾（ファイアウォール）のこと。", intermediateDesc: "SQLインジェクションやクロスサイトスクリプティング(XSS)など、一般的なWebエクスプロイトからWebアプリケーションを保護するファイアウォール。", examTip: "「SQLインジェクションからの保護」「特定のIPアドレスからのWebリクエストのブロック」と来たらWAFです。" },
    { term: "AWS Shield", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "DDoS攻撃（大量のアクセスでサイトを落とす攻撃）からシステムを守るサービス。無料版と有料版がある。", intermediateDesc: "マネージド型のDDoS（分散型サービス拒否）攻撃に対する保護サービス。全AWSユーザーに自動で適用される無料のStandardと、高度な保護を提供するAdvancedがあります。", examTip: "「DDoS攻撃からの保護」というキーワードが最大のヒントです。WAF（Web攻撃）との違いを明確にしてください。" },
    { term: "Amazon GuardDuty", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "怪しい動きがないか、常にAIが見回ってくれる脅威の自動検知サービス（パトロール隊）。", intermediateDesc: "機械学習を利用して、AWSアカウントやワークロード内の悪意のあるアクティビティや不正な動作を継続的にモニタリングする脅威検出サービス。", examTip: "「悪意のあるアクティビティの検出」「インテリジェントな脅威検出」と来たらGuardDutyを選びましょう。" },
    { term: "Amazon Inspector", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "サーバー（EC2）の中に弱点（脆弱性）がないか、自動で健康診断をしてくれるサービス。", intermediateDesc: "EC2インスタンスやコンテナイメージのソフトウェアの脆弱性、意図しないネットワークの露出を自動的にスキャン・検出する脆弱性管理サービス。", examTip: "「EC2の脆弱性評価」「意図しないネットワークアクセスの検出」というキーワードで出題されます。" },
    { term: "AWS Security Hub", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "GuardDutyやInspectorなど、色々なセキュリティチェックの結果を1つの画面にまとめて見せてくれる「セキュリティの司令塔」。", intermediateDesc: "AWSアカウント全体のセキュリティ状態の包括的なビューを提供するサービス。GuardDutyやMacieなどのアラートを一元的に集約・管理します。", examTip: "「複数のAWSサービスのセキュリティアラートを一元管理（集約）する」という文脈で出題されます。" },
    { term: "AWS Artifact", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "AWSが第三者機関から受けた「うちは安全ですよ」という証明書やレポートをダウンロードできる場所。", intermediateDesc: "ISO、PCI、SOCレポートなど、AWSのセキュリティおよびコンプライアンスレポートにオンデマンドでアクセスできるポータル。", examTip: "「AWSのコンプライアンスレポートを取得したい」「PCI DSSの証明書をダウンロードしたい」と問われたらArtifactです。" },
    { term: "AWS Directory Service", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "会社のパソコンのログイン情報（Active Directory）を、そのままAWSでも使えるように繋いでくれるサービス。", intermediateDesc: "AWS上でマネージド型のMicrosoft Active Directory (AD) を提供し、オンプレミスのADと統合できるサービス。", examTip: "「オンプレミスのActive Directoryとの統合」「AWS上でADを利用する」がキーワード。" },
    { term: "AWS KMS (Key Management Service)", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "データを盗まれないように「暗号化」するための鍵を作って、安全に管理してくれる金庫。", intermediateDesc: "データの暗号化に使用する暗号化キー（カスタマー管理キーなど）の作成と管理を行うマネージドサービス。", examTip: "「保管時の暗号化（Encryption at rest）」「暗号化キーの中央管理」というキーワードで正解になります。" },
    { term: "Amazon Macie", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "S3の中にクレジットカード番号などの「個人情報」が置きっぱなしになっていないか、AIが探して守ってくれるサービス。", intermediateDesc: "機械学習を使用してAWS上の機密データ（PIIなど）を自動的に検出し、保護するデータセキュリティサービス。", examTip: "「S3内の機密データ（個人情報、PII）の保護・検出」と来たらMacie一択です。" },
    { term: "AWS Secrets Manager", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "データベースのパスワードなどの「秘密の情報」を安全に保管し、定期的に自動で新しいものに変えてくれる金庫。", intermediateDesc: "データベースの認証情報、APIキーなどのシークレットを安全に保存し、ライフサイクル全体（自動ローテーションなど）を管理するサービス。", examTip: "「認証情報の自動ローテーション」「ソースコードへのパスワードのハードコード排除」がキーワードです。" },
    { term: "Amazon Cognito", domain: "第2分野: セキュリティとコンプライアンス", beginnerDesc: "自分が作ったWebサイトやアプリに「ログイン機能（ユーザー登録やパスワード忘れ対応など）」を簡単に追加できるサービス。", intermediateDesc: "ウェブアプリケーションやモバイルアプリケーションにユーザーのサインアップ、サインイン、およびアクセスコントロールを迅速に追加できるサービス。", examTip: "「Webアプリやモバイルアプリへのユーザー認証の追加」と来たらCognitoです。" },

    // --- 第3分野: クラウドテクノロジーとサービス ---
    // インフラ・コンピューティング
    { term: "リージョンとアベイラビリティーゾーン(AZ)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "リージョンは「東京」などの大きな地域。AZはその中にある独立したデータセンターの集まり。複数のAZを使うことで災害に強くなる。", intermediateDesc: "リージョンは地理的な領域。各リージョンには、物理的に分離され冗長化された電源とネットワークを持つ複数のAZが存在し、高可用性を実現します。", examTip: "「高可用性を実現するアーキテクチャは？」と問われたら「複数のAZ（マルチAZ）に配置する」が正解です。" },
    { term: "Amazon EC2 (Elastic Compute Cloud)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "AWS上で借りられる「仮想のパソコン（サーバー）」。OSを選んで好きなソフトを入れることができる。", intermediateDesc: "クラウド内の安全でサイズ変更可能なコンピューティング性能（仮想サーバー）を提供するサービス。完全なOSレベルの制御が可能です。", examTip: "「OSへの完全なアクセスが必要」「仮想サーバーを起動する」という要件を満たすサービスとして出題されます。" },
    { term: "AWS Lambda", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "サーバーを作らなくても、プログラム（コード）だけ用意すれば実行してくれる魔法のようなサービス。", intermediateDesc: "サーバーをプロビジョニングまたは管理せずにコードを実行できるサーバーレスコンピューティングサービス。ミリ秒単位の実行時間で課金されます。", examTip: "「サーバーの管理が不要（サーバーレス）」「イベント駆動でコードを実行する」というキーワードの決定打です。" },
    { term: "Amazon ECR (Elastic Container Registry)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "Dockerなどの「コンテナのイメージ（アプリの設計図）」を安全に保存・管理しておくための専用倉庫。", intermediateDesc: "開発者がDockerコンテナイメージを簡単に保存、管理、デプロイできる、フルマネージド型のコンテナレジストリサービス。", examTip: "「コンテナイメージの保存先」「Dockerイメージのレジストリ」がキーワード。" },
    { term: "AWS Fargate", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "コンテナ（アプリを動かす箱）を動かす時に、裏側のサーバーの管理を一切しなくて済む楽ちんサービス。", intermediateDesc: "Amazon ECSやEKSでコンテナを実行するためのサーバーレスコンピューティングエンジン。基盤となるサーバーの管理が不要です。", examTip: "「コンテナの実行」「インフラストラクチャの管理不要（サーバーレスでコンテナを実行）」の組み合わせで出題されます。" },
    { term: "AWS Elastic Beanstalk", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "作ったアプリのコードを渡すだけで、必要なサーバーやネットワークをAWSが勝手に全部用意してくれるお任せサービス。", intermediateDesc: "アプリケーションのコードをアップロードするだけで、容量のプロビジョニング、負荷分散、Auto Scaling からアプリケーションのヘルスモニタリングまで、自動的に処理するPaaS。", examTip: "「インフラの管理をせずにWebアプリケーションを簡単にデプロイしたい」というシナリオで正解になります。" },
    
    // ストレージ
    { term: "Amazon S3 (Simple Storage Service)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "画像や動画、ファイルなど、何でも無限に保存できる超頑丈なインターネット上の倉庫。", intermediateDesc: "高い耐久性（99.999999999% = 11の9）と可用性を備えたオブジェクトストレージ。静的ウェブサイトホスティングやデータレイクとしても利用されます。", examTip: "「オブジェクトストレージ」「静的ウェブサイトのホスティング」「耐久性 11の9」というキーワードで頻出です。" },
    { term: "Amazon EBS (Elastic Block Store)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "EC2（仮想パソコン）にガチャンと繋いで使う「外付けハードディスク」。", intermediateDesc: "EC2インスタンスで使用するために設計された、高性能なブロックストレージサービス。EC2を停止・終了してもデータを保持できます。", examTip: "「EC2用のブロックストレージ」「OSをインストールするドライブ」と来たらEBSです。" },
    { term: "AWS Storage Gateway", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "会社のサーバー（オンプレミス）とAWSの倉庫（S3）を繋げて、クラウドの容量を自分のハードディスクのように使えるようにするサービス。", intermediateDesc: "オンプレミス環境から実質無制限のクラウドストレージ（S3など）へのアクセスを提供するハイブリッドクラウドストレージサービス。", examTip: "「オンプレミスとクラウドストレージの統合」「ハイブリッドストレージ」がキーワードです。" },
    { term: "AWS Snow Family", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "インターネット経由では時間がかかりすぎる膨大なデータを、物理的な専用の箱に入れてトラックで運んでくれるサービス。", intermediateDesc: "ペタバイト規模のデータを物理的デバイス（Snowcone, Snowballなど）を使用して、AWSクラウドとの間で安全かつ迅速にオフライン転送するサービス。", examTip: "「オフラインのデータ転送」「大容量データをネットワークを使わずに移行」がキーワード。" },
    
    // データベース・移行
    { term: "Amazon RDS (Relational Database Service)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "MySQLなどのデータベースを、面倒な設定なしで簡単に使えるようにしてくれるサービス。", intermediateDesc: "リレーショナルデータベース（MySQL, PostgreSQL, Oracle等）のセットアップ、運用、スケーリングを簡単に行えるマネージドサービス。", examTip: "「リレーショナルデータベース（RDB）」「複雑なトランザクションやSQLクエリを実行する」という要件で使われます。" },
    { term: "Amazon DynamoDB", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "どんなにデータが増えても一瞬（ミリ秒）でデータを返してくれる、速さが自慢のデータベース。", intermediateDesc: "あらゆる規模で数ミリ秒単位のパフォーマンスを実現する、フルマネージド型のサーバーレスNoSQL（非リレーショナル）データベース。", examTip: "「NoSQLデータベース」「キーバリューストア」「ミリ秒単位のレイテンシー」がキーワードです。" },
    { term: "Amazon DocumentDB", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "JSONのような「ドキュメント形式」のデータを扱うのが得意なデータベース（MongoDBと互換性あり）。", intermediateDesc: "MongoDB互換の、高速でスケーラブルなフルマネージド型ドキュメントデータベースサービス。", examTip: "「MongoDB互換」「ドキュメントデータベース」がキーワード。" },
    { term: "Amazon Neptune", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "「AさんとBさんは友達」のような、複雑な「つながり（グラフ）」を管理するデータベース。", intermediateDesc: "高度に接続されたデータセットを扱うアプリケーションを構築・実行するための、高速で信頼性の高いフルマネージド型グラフデータベース。", examTip: "「グラフデータベース」「高度に接続されたデータセット」「SNSのつながりやレコメンデーションエンジン」がキーワード。" },
    { term: "Amazon ElastiCache", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "よく使うデータを「メモリ」に入れておくことで、データベースの負担を減らしサイトを爆速にするサービス。", intermediateDesc: "ミリ秒未満のレイテンシーを提供する、インメモリのデータストアおよびキャッシュサービス（Redis / Memcached互換）。", examTip: "「インメモリキャッシュ」「データベースの読み込み負荷を軽減」「ミリ秒未満の応答」がキーワード。" },
    { term: "AWS Database Migration Service (DMS)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "稼働中のデータベースを止めることなく、別のデータベースやAWSへ安全に引っ越しさせてくれるサービス。", intermediateDesc: "ソースデータベースを完全に運用可能な状態に保ちながら、リレーショナルデータベースやデータウェアハウスをAWSに移行できるサービス。", examTip: "「ダウンタイムなしでのデータベース移行」「異種データベース間の移行」がキーワード。" },
    { term: "AWS DataSync", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "オンプレミスのサーバーとAWS（S3やEFSなど）の間で、大量のデータを自動で高速に同期・転送してくれるサービス。", intermediateDesc: "オンプレミスストレージシステムとAWSストレージサービス間でのデータ転送を自動化および加速するオンラインデータ転送サービス。", examTip: "「オンプレミスとAWS間の高速なデータ同期」「NFSやSMBからのデータ移行」がキーワード。" },

    // ネットワーク
    { term: "Amazon VPC (Virtual Private Cloud)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "AWSの中に自分だけの「プライベートなネットワーク空間」を作るサービス。家の中に壁を作るイメージ。", intermediateDesc: "AWSクラウド内に論理的に隔離された仮想ネットワーク環境を構築するサービス。サブネット、ルートテーブル、ゲートウェイなどを設定できます。", examTip: "「論理的に隔離されたネットワーク」「自社専用のプライベートネットワーク環境」と問われたらVPCです。" },
    { term: "AWS Transit Gateway", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "たくさんあるVPC（ネットワーク）や会社のネットワークを、中心のハブに集めて一括で繋ぐ「交差点」。", intermediateDesc: "複数の中央ネットワーク（VPCやオンプレミス）を単一のゲートウェイに接続するクラウドのルーター。", examTip: "「ハブアンドスポークのネットワークトポロジ」「複雑なVPCピアリングの簡素化」がキーワード。" },
    { term: "AWS Direct Connect", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "会社とAWSを、インターネットを通さずに「専用の秘密のトンネル（専用線）」で直接つなぐサービス。", intermediateDesc: "オンプレミスからAWSへの専用ネットワーク接続を構築し、インターネットを経由しない一貫した低レイテンシーと安全な通信を提供するサービス。", examTip: "「インターネットを経由しない専用線」「一貫したネットワークパフォーマンス」がキーワードです。" },
    { term: "AWS Global Accelerator", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "世界中のユーザーがアクセスしてくるアプリを、AWSの専用ネットワークを使って爆速にしてくれるサービス。", intermediateDesc: "AWSのグローバルネットワークバックボーンを使用して、ローカルおよびグローバルユーザーのアプリケーショントラフィックのパフォーマンスを向上させるサービス。", examTip: "「グローバルユーザー向けのアプリケーションのパフォーマンス（速度）を向上させる」と問われたらGlobal Acceleratorです。" },
    { term: "Amazon Route 53", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "「google.com」のようなドメイン名と、実際のサーバーの場所を紐付けて案内するサービス（DNS）。", intermediateDesc: "可用性と拡張性に優れたクラウドのドメインネームシステム (DNS) ウェブサービス。トラフィックのルーティングを行います。", examTip: "「ドメインの管理（DNS）」「ユーザーを最適なエンドポイントにルーティングする」役割で出題されます。" },
    { term: "Amazon CloudFront", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "世界中にデータを一時保存して、遠くのユーザーにも画像や動画を爆速で届けるサービス。", intermediateDesc: "データ、動画、アプリケーション、APIを世界中の視聴者に低レイテンシーで安全に配信するコンテンツ配信ネットワーク(CDN)サービス。", examTip: "「グローバルユーザーへの低レイテンシー配信」「エッジロケーションを利用してコンテンツをキャッシュする」がキーワードです。" },
    { term: "Elastic Load Balancing (ELB)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "大量のアクセスが来た時に、複数のサーバーへ均等に仕事を振り分ける「交通整理の係員」。", intermediateDesc: "受信したアプリケーショントラフィックを、複数のEC2インスタンスやコンテナなどに自動的に分散し、耐障害性を高めるサービス。", examTip: "「トラフィックの負荷分散」「単一のEC2にアクセスが集中するのを防ぐ」というシナリオで正解になります。" },
    { term: "Amazon API Gateway", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "作ったプログラム（Lambdaなど）を、外の世界から呼び出せるようにするための「受付窓口（API）」を作るサービス。", intermediateDesc: "あらゆる規模のAPIの作成、公開、保守、モニタリング、および保護を簡単に行うことができるフルマネージドサービス。", examTip: "「APIの作成と管理」「サーバーレスアーキテクチャのフロントドア（入り口）」がキーワード。" },
    
    // 管理・自動化・統合
    { term: "AWS Auto Scaling", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "忙しい時はサーバーの台数を自動で増やし、暇な時は減らしてくれる「自動増減機能」。", intermediateDesc: "ワークロードの需要に合わせてコンピューティングリソース（EC2インスタンスなど）を自動的にスケールアウト（拡張）およびスケールイン（縮小）する機能。", examTip: "「需要のスパイクに対応する」「使用されていないリソースを停止してコストを最適化する」のが主な役割です。" },
    { term: "AWS CloudFormation", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "サーバーやネットワークの設定を「設計図（コード）」として書いておけば、ボタン一つで全く同じ環境を自動で作ってくれるサービス。", intermediateDesc: "インフラストラクチャをコードとして扱う（IaC）ことで、AWSリソースのプロビジョニングと管理を自動化し、環境の複製を容易にするサービス。", examTip: "「Infrastructure as Code (IaC)」「テンプレートを使ってリソースを自動プロビジョニング」がキーワード。" },
    { term: "AWS Systems Manager", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "大量のEC2（サーバー）のパッチ当てや設定変更を、1台ずつやらずに一括で自動化できる便利な管理ツール。", intermediateDesc: "AWSやオンプレミス上のインフラストラクチャの可視化と制御を行い、運用タスク（パッチ適用など）を自動化するサービス。", examTip: "「フリート全体のパッチ適用（Patch Manager）」「運用タスクの自動化と一元管理」がキーワード。" },
    { term: "AWS Service Catalog", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "会社が「この設定のサーバーなら勝手に使っていいよ」と承認したITサービスだけを集めた、社内専用のカタログ（メニュー表）。", intermediateDesc: "組織で承認されたITサービスのカタログを作成・管理し、ユーザーが規定に準拠したリソースをセルフサービスでデプロイできるようにするサービス。", examTip: "「承認済みのITサービスのカタログ」「一貫したガバナンスとコンプライアンスの維持」がキーワード。" },
    { term: "Amazon SNS (Simple Notification Service)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "メールやSMSなどに対して、一斉に「お知らせ（通知）」を送るサービス。", intermediateDesc: "パブリッシュ/サブスクライブ(Pub/Sub)モデルを採用した、フルマネージド型のメッセージング・通知サービス。EメールやSMSへの配信も可能。", examTip: "「システム管理者にEメールでアラートを送信する」「プッシュ通知」と来たらSNSです。" },
    { term: "Amazon SQS (Simple Queue Service)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "仕事の依頼を一時的に並べておく「順番待ちの列（キュー）」。システムがパンクするのを防ぐ。", intermediateDesc: "マイクロサービスなどを疎結合化し、スケーリングするためのメッセージキューイングサービス。メッセージの欠損を防ぎます。", examTip: "「アプリケーションの疎結合化」「メッセージを一時的に保存して処理の遅延を吸収する（バッファリング）」がキーワードです。" },
    { term: "AWS Step Functions", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "複数のAWSサービス（Lambdaなど）を、順番通りに動かしたり条件で分岐させたりする「ワークフローの指揮者」。", intermediateDesc: "視覚的なワークフローを使用して、複数のAWSサービスをサーバーレスアプリケーションとして調整（オーケストレーション）するサービス。", examTip: "「サーバーレスワークフローのオーケストレーション」「ステートマシン」がキーワード。" },
    { term: "Amazon EventBridge", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "AWSの中で「何かが起きた（S3にファイルが置かれた等）」というイベントをキャッチして、別のサービスに知らせる「伝書鳩」。", intermediateDesc: "さまざまなソースからのイベントを使用して、アプリケーションコンポーネントを接続し、イベント駆動型アーキテクチャを構築するサーバーレスイベントバス。", examTip: "「イベント駆動型アーキテクチャ」「SaaSアプリケーションとの統合」がキーワード。" },
    
    // 分析・AI/ML
    { term: "Amazon Athena", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "S3の倉庫に置いた大量のデータ（ログなど）を、データベースに入れ直さなくてもそのまま検索できるサービス。", intermediateDesc: "サーバーレスで、標準的なSQLを使用してAmazon S3内のデータを直接分析できるインタラクティブなクエリサービス。", examTip: "「S3内のデータを直接SQLで分析する」「サーバーレスのクエリサービス」がキーワードです。" },
    { term: "Amazon EMR (Elastic MapReduce)", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "HadoopやSparkといった技術を使って、超巨大なデータ（ビッグデータ）を分析・処理するサービス。", intermediateDesc: "Apache Hadoop、Apache Sparkなどのオープンソースツールを使用して、膨大な量のデータを処理するためのクラウドビッグデータプラットフォーム。", examTip: "「Hadoop」や「ビッグデータの処理」というキーワードが出たらEMRです。" },
    { term: "AWS Glue", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "バラバラのデータを分析しやすいように、抽出・変換・読み込み（ETL）を自動でやってくれるサービス。", intermediateDesc: "分析のためのデータの準備（抽出、変換、ロード: ETL）を簡単に行える、サーバーレスのデータ統合サービス。", examTip: "「ETL（Extract, Transform, Load）」「分析用のデータ準備」がキーワードです。" },
    { term: "Amazon QuickSight", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "大量のデータを分かりやすいグラフや表（ダッシュボード）にしてくれる、ビジネス向けの分析ツール。", intermediateDesc: "機械学習を活用した、スケーラブルでサーバーレスなビジネスインテリジェンス（BI）サービス。ダッシュボードを作成してデータを視覚化します。", examTip: "「データの視覚化」「インタラクティブなダッシュボード」「ビジネスインテリジェンス（BI）」がキーワード。" },
    { term: "Amazon SageMaker", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "AI（機械学習）のモデルを作って、学習させて、実際に使えるようにするまでを全部サポートするサービス。", intermediateDesc: "開発者およびデータサイエンティストが、機械学習モデルを迅速に構築、トレーニング、デプロイできるようにするフルマネージドサービス。", examTip: "「機械学習モデルの構築・トレーニング・デプロイ」と来たらSageMakerです。" },
    { term: "Amazon Lex", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "音声やテキストを使って、まるで人間と会話しているような「チャットボット」を簡単に作れるAIサービス。", intermediateDesc: "音声とテキストを使用して、任意のアプリケーションに対話型インターフェイス（チャットボット）を構築するためのAIサービス。", examTip: "「チャットボット」「対話型インターフェイス」がキーワード（Alexaと同じ技術）。" },
    { term: "Amazon Rekognition", domain: "第3分野: クラウドテクノロジーとサービス", beginnerDesc: "画像や動画をAIに見せると、「これは犬です」「この人は笑っています」と中身を分析してくれるサービス。", intermediateDesc: "機械学習の専門知識がなくても、アプリケーションに画像と動画の分析（顔認識、オブジェクト検出など）を簡単に追加できるサービス。", examTip: "「画像分析」「動画分析」「顔認識」がキーワード。" },

    // --- 第4分野: 請求、料金、サポート ---
    { term: "AWS Organizations", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "会社で使う複数のAWSアカウントを1つにまとめて、支払いを一緒にしたり、ルールを統一したりするサービス。", intermediateDesc: "複数のAWSアカウントを組織として統合・一元管理するサービス。一括請求（コンソリデーティッドビリング）やSCPによる権限の統制が可能です。", examTip: "「複数アカウントの一括請求（ボリュームディスカウントの共有）」「サービスコントロールポリシー(SCP)」と来たらOrganizationsです。" },
    { term: "AWS Cost Explorer", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "「何にいくら使っているか」をグラフで分かりやすく表示し、未来のコストも予測してくれる家計簿ツール。", intermediateDesc: "時間経過に伴うAWSのコストと使用量を可視化、分析するツール。過去12ヶ月のデータ確認や、今後12ヶ月のコスト予測が可能です。", examTip: "「将来のコストを予測する」「コストの傾向を視覚的にグラフで分析する」というシナリオで正答になります。" },
    { term: "AWS Budgets", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "「今月の予算を超えそう！」という時に、メールなどでアラート（警告）を飛ばしてくれるサービス。", intermediateDesc: "コストや使用量が、あらかじめ設定した予算のしきい値を超えた（または超えると予測された）場合に、アラートを送信するサービス。", examTip: "「予算を超過した場合に通知を受け取る」という要件では、Cost ExplorerではなくBudgetsを選んでください。" },
    { term: "AWS Cost and Usage Report (CUR)", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "「何時何分にどのサービスをいくら使ったか」が一番細かく載っている、AWSの公式な請求明細データ。", intermediateDesc: "AWSのコストと使用量に関する最も包括的で詳細なデータを提供するレポート。S3バケットにCSV形式等で配信されます。", examTip: "「最も詳細な（きめ細かい）コストと使用量のデータが必要」と問われたらCURを選びます。" },
    { term: "AWS Pricing Calculator", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "「AWSでこのシステムを作ったら、毎月いくらになるかな？」を事前に計算して見積もりを出せるツール。", intermediateDesc: "AWSサービスの利用料金を見積もるためのツール。アーキテクチャの月額コストや年額コストをクラウド導入前に把握できます。", examTip: "「コストの見積もりを作成する」「クラウド移行前の料金シミュレーション」がキーワードです。" },
    { term: "AWS Trusted Advisor", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "「コスト高すぎませんか？」「セキュリティ甘いですよ？」と、環境をチェックして助言をくれるアドバイザー。", intermediateDesc: "コスト最適化、パフォーマンス、セキュリティ、フォールトトレランス、サービスクォータの5つのカテゴリで、AWS環境を分析しベストプラクティスを推奨するツール。", examTip: "「コスト最適化の推奨事項を得る」「使用されていないEC2インスタンスを見つける」ツールとして頻出です。" },
    { term: "リザーブドインスタンス (RI)", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "「1年か3年、絶対にこれ使います！」と予約することで、料金が大幅に安くなるEC2などの割引プラン。", intermediateDesc: "1年または3年の期間をコミット（契約）することで、オンデマンド料金と比較して大幅な割引（最大72%）を受けられる料金モデル。", examTip: "「稼働し続けることがわかっている（予測可能な）データベースサーバーのコストを削減したい」というシナリオで選ばれます。" },
    { term: "Savings Plans", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "RI（予約プラン）と似ているが、もっと柔軟。1年か3年「毎月これくらい（ドル）使います」と約束することで安くなるプラン。", intermediateDesc: "1年または3年間の特定の利用額（例: 10 USD/時間）をコミットすることで、オンデマンド料金に比べて低料金で利用できる柔軟な料金モデル。", examTip: "「RIより柔軟な料金モデル」「インスタンスファミリーやリージョンを変更しても割引が適用される」がキーワード。" },
    { term: "スポットインスタンス", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "AWSが余らせているサーバーを格安で借りるプラン。途中で強制終了される可能性があるが一番安い。", intermediateDesc: "AWSの予備のEC2キャパシティを利用する料金モデル。最大90%の割引を受けられるが、AWS側でキャパシティが必要になると2分前の警告で中断されます。", examTip: "「中断されても問題ないバッチ処理」「いつでも再開可能な一時的なテスト」を最も安く実行する方法として出題されます。" },
    { term: "AWS Marketplace", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "AWSで使える便利なソフトウェア（他の会社が作ったセキュリティソフトなど）を買ってすぐに使える「アプリストア」のような場所。", intermediateDesc: "独立系ソフトウェアベンダー(ISV)が提供する何千ものサードパーティー製ソフトウェアを検索、購入、デプロイ、管理できるデジタルカタログ。", examTip: "「サードパーティーのソフトウェアを購入・デプロイする」「ISVのソリューション」がキーワード。" },
    { term: "AWS サポートプラン", domain: "第4分野: 請求、料金、サポート", beginnerDesc: "困ったときの相談窓口。ベーシック(無料)、開発者、ビジネス、エンタープライズのランクがある。", intermediateDesc: "要件に応じて選択できるサポート体制。ビジネスプラン以上でAWS Trusted Advisorの全チェック項目や、24時間365日の電話サポートが利用可能になります。", examTip: "「24時間365日の電話サポート」が必要ならビジネス以上、「TAM（テクニカルアカウントマネージャー）」が必要ならエンタープライズです。" }
];

// --- Roadmap Data ---
const ROADMAP_DATA = [
    {
        id: 'week1',
        title: 'レベル1: クラウドの全体像とコンセプト',
        tasks: [
            { id: 'w1_t1', title: '試験ガイド(要約)を一読する', desc: '試験の範囲と合格ライン(700点)を把握しましょう。' },
            { id: 'w1_t2', title: '単語カードを1周する (第1分野)', desc: 'クラウドのメリット(伸縮性、俊敏性など)を覚えましょう。' },
            { id: 'w1_t3', title: '初級の模擬テストを10問解く', desc: 'まずは簡単な問題で形式に慣れましょう。' },
        ]
    },
    {
        id: 'week2',
        title: 'レベル2: 主要なクラウドテクノロジー',
        tasks: [
            { id: 'w2_t1', title: '単語カードを1周する (第3分野)', desc: 'EC2、S3、RDS、VPCなどの基本サービスを暗記します。' },
            { id: 'w2_t2', title: '分野限定で模擬テストを解く (第3分野)', desc: '一番出題割合が高い(34%)分野を重点的に固めます。' },
            { id: 'w2_t3', title: 'AIチューターにわからないサービスを質問する', desc: '「EC2とLambdaの違いは何？」など気軽に質問してみましょう。' },
        ]
    },
    {
        id: 'week3',
        title: 'レベル3: セキュリティとコンプライアンス',
        tasks: [
            { id: 'w3_t1', title: '単語カードを1周する (第2分野)', desc: '責任共有モデルやIAMなどの重要概念を暗記します。' },
            { id: 'w3_t2', title: '分野限定で模擬テストを解く (第2分野)', desc: 'セキュリティ分野(30%)の基礎を固めます。' },
            { id: 'w3_t3', title: 'AIチューターで「責任共有モデル」の理解度チェックを受ける', desc: 'ガイドモードを使って知識の定着を確認しましょう。' },
        ]
    },
    {
        id: 'week4',
        title: 'レベル4: 請求・サポートと実戦練習',
        tasks: [
            { id: 'w4_t1', title: '単語カードを1周する (第4分野)', desc: 'AWS Organizationsや各種料金モデルを把握します。' },
            { id: 'w4_t2', title: '中級の模擬テスト(全分野)を20問解く', desc: '実際の試験レベルの問題に挑戦し始めましょう。' },
            { id: 'w4_t3', title: 'ダッシュボードで苦手分野を確認する', desc: '学習の進捗状況グラフから正答率の低い分野をチェックしましょう。' },
        ]
    },
    {
        id: 'week5',
        title: 'レベル5: 最終仕上げと弱点克服',
        tasks: [
            { id: 'w5_t1', title: '苦手なタスクを絞り込んで模擬テストを解く', desc: '例：「3.3 コンピューティング」など細かく指定して弱点を補強します。' },
            { id: 'w5_t2', title: '上級の模擬テストを解く', desc: '少しひねった問題やシナリオ問題に慣れます。' },
            { id: 'w5_t3', title: '総合正答率80%以上を達成する', desc: '本番(70%)を超える自信をつけて試験に臨みましょう！' },
        ]
    }
];

const initialStats = {
    totalAnswered: 0,
    correctAnswers: 0,
    totalStudyTime: 0, // 全期間の累積学習時間（秒）を追加
    domainStats: DOMAINS.reduce((acc, domain) => {
        acc[domain] = { total: 0, correct: 0 };
        return acc;
    }, {}),
    dailyStats: {},
    roadmapProgress: [],
    settings: { textSize: 'md', theme: 'dark' },
    // AIチューターの会話履歴を保存するための初期ステートを追加
    tutorHistory: {
        guide: [
            { role: 'model', text: 'こんにちは！AWS認定クラウドプラクティショナー(CLF-C02)のガイドAIです。\n一緒にロードマップに沿って学習を進めていきましょう！\n\nまずは「レベル1: クラウドの全体像とコンセプト」から始めますか？準備ができたら「始める」と教えてください。' }
        ],
        qna: [
            { role: 'model', text: 'こんにちは！AIチューターです。\n試験範囲でわからない用語や、サービス同士の違いなどがあれば、何でも自由に質問してください。' }
        ]
    }
};

// --- Helper Functions ---
const formatDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatStudyTimeStr = (totalSeconds) => {
    if (!totalSeconds) return { value: 0, unit: '分', full: '0分' };
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) {
        return { value: h, unit: '時間', full: `${h}時間 ${m}分` };
    }
    if (m === 0) return { value: '< 1', unit: '分', full: '1分未満' };
    return { value: m, unit: '分', full: `${m}分` };
};

// --- Main Application Component ---
export default function App() {
    const [currentView, setCurrentView] = useState('dashboard');
    const [quizPool, setQuizPool] = useState(INITIAL_QUIZZES);
    const [usedQuizIds, setUsedQuizIds] = useState([]);
    
    // 追加: タイマー内で最新の画面状態を参照するためのRef
    const currentViewRef = useRef(currentView);
    useEffect(() => {
        currentViewRef.current = currentView;
    }, [currentView]);
    
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState(initialStats);
    
    // APIキーのState（初期値はlocalStorageから取得）
    const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('aws_clf_gemini_api_key') || '');

    const handleApiKeyUpdate = (key) => {
        setUserApiKey(key);
        localStorage.setItem('aws_clf_gemini_api_key', key);
    };

    // プレビュー環境のデフォルトキーか、ユーザーが入力したキーを使用
    const activeApiKey = fallbackApiKey || userApiKey;

    // Firebase Authentication
    useEffect(() => {
        if (!auth) return;
        const initAuth = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (e) { console.error(e); }
        };
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, setUser);
        return () => unsubscribe();
    }, []);

    // Firestore Data Sync
    useEffect(() => {
        if (!user || !db) return;
        const statsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'appData', 'stats');
        
        const unsubscribe = onSnapshot(statsRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setStats(prev => ({
                    ...initialStats,
                    ...data,
                    domainStats: { ...initialStats.domainStats, ...(data.domainStats || {}) },
                    dailyStats: data.dailyStats || {},
                    settings: { ...initialStats.settings, ...(data.settings || {}) },
                    tutorHistory: data.tutorHistory || initialStats.tutorHistory
                }));
            }
        }, (err) => console.error(err));
        
        return () => unsubscribe();
    }, [user]);

    // ユーザーアクティビティの監視（学習時間計測のための生存確認）
    const lastActiveTimeRef = useRef(Date.now());
    useEffect(() => {
        const handleActivity = () => {
            lastActiveTimeRef.current = Date.now();
        };
        
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('click', handleActivity);
        window.addEventListener('touchstart', handleActivity);
        window.addEventListener('scroll', handleActivity);

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
            window.removeEventListener('scroll', handleActivity);
        };
    }, []);

    // 学習時間の計測とFirestoreへの定期保存（1分ごと）
    useEffect(() => {
        if (!user || !db) return; // ログイン前は計測しない
        
        const INACTIVE_THRESHOLD = 1 * 60 * 1000; // 【変更】1分操作がなければ離席とみなす
        let localSeconds = 0;

        const timerId = setInterval(() => {
            // 【対策A】ブラウザのタブが裏に回っている（非表示）場合はカウントしない
            if (document.hidden) {
                return;
            }

            // 【対策B】学習画面を開いている時のみカウントする
            const studyViews = ['quiz', 'flashcard', 'tutor'];
            if (!studyViews.includes(currentViewRef.current)) {
                return;
            }

            // アクティブな場合のみカウントアップ
            if (Date.now() - lastActiveTimeRef.current < INACTIVE_THRESHOLD) {
                localSeconds += 1;
                
                // 1分(60秒)ごとに保存処理をトリガー
                if (localSeconds >= 60) {
                    const today = formatDateStr(new Date());
                    const addedSeconds = localSeconds;
                    localSeconds = 0; // リセット
                    
                    setStats(prevStats => {
                        const newStats = { ...prevStats };
                        newStats.totalStudyTime = (newStats.totalStudyTime || 0) + addedSeconds;
                        
                        if (!newStats.dailyStats) newStats.dailyStats = {};
                        if (!newStats.dailyStats[today]) newStats.dailyStats[today] = { answered: 0, correct: 0, studyTime: 0 };
                        // 日別の学習時間も加算
                        newStats.dailyStats[today].studyTime = (newStats.dailyStats[today].studyTime || 0) + addedSeconds;
                        
                        // DB同期処理（ローカルからの上書き）
                        const statsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'appData', 'stats');
                        setDoc(statsRef, newStats, { merge: true }).catch(console.error);
                        
                        return newStats;
                    });
                }
            }
        }, 1000); // 1秒ごとにチェック

        return () => clearInterval(timerId);
    }, [user, db]);

    const updateStats = async (newStats) => {
        setStats(newStats); // UI即時反映
        if (user && db) {
            try {
                const statsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'appData', 'stats');
                await setDoc(statsRef, newStats, { merge: true });
            } catch (e) { console.error("Save Error", e); }
        }
    };

    // テキストサイズに応じたクラスの定義
    const textSize = stats.settings?.textSize || 'md';
    const textClasses = {
        sm: { base: 'text-sm', lg: 'text-base', xl: 'text-lg', sm: 'text-xs', title: 'text-xl', big: 'text-2xl', super: 'text-3xl' },
        md: { base: 'text-base', lg: 'text-lg', xl: 'text-xl', sm: 'text-sm', title: 'text-2xl', big: 'text-3xl', super: 'text-4xl' },
        lg: { base: 'text-lg', lg: 'text-xl', xl: 'text-2xl', sm: 'text-base', title: 'text-3xl', big: 'text-4xl', super: 'text-5xl' }
    }[textSize];

    // テーマ設定
    const theme = stats.settings?.theme || 'dark';

    return (
        <div className={`flex h-screen overflow-hidden font-sans ${theme === 'dark' ? 'dark' : ''}`}>
            <div className="flex w-full h-full bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 transition-colors duration-300">
                {/* Sidebar Navigation */}
                <nav className="w-20 md:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0 z-10 shadow-sm transition-colors duration-300">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-center md:justify-start">
                        <Cloud className="text-blue-600 dark:text-blue-400 w-8 h-8 shrink-0" /> {/* BrainをCloudに変更 */}
                        <h1 className="text-sm md:text-base font-bold text-blue-600 dark:text-blue-400 ml-2 hidden md:block leading-tight">
                            AWS認定クラウド<br/>プラクティショナー<br/><span className="text-xs text-blue-500 dark:text-blue-400/80 font-normal">(CLF-C02)</span>
                        </h1>
                    </div>
                    <div className="flex-1 p-2 md:p-4 space-y-2 overflow-y-auto">
                    <NavItem icon={<LayoutDashboard />} label="ダッシュボード" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
                    <NavItem icon={<HelpCircle />} label="模擬テスト" active={currentView === 'quiz'} onClick={() => setCurrentView('quiz')} />
                    <NavItem icon={<BookOpen />} label="単語カード" active={currentView === 'flashcard'} onClick={() => setCurrentView('flashcard')} />
                    <NavItem icon={<Map />} label="学習ロードマップ" active={currentView === 'roadmap'} onClick={() => setCurrentView('roadmap')} />
                    <NavItem icon={<MessageSquare />} label="AIチューター" active={currentView === 'tutor'} onClick={() => setCurrentView('tutor')} />
                    <NavItem icon={<FileText />} label="試験ガイド (要約)" active={currentView === 'guide'} onClick={() => setCurrentView('guide')} />
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
                {currentView === 'dashboard' && <DashboardView stats={stats} updateStats={updateStats} setUsedQuizIds={setUsedQuizIds} textClasses={textClasses} userApiKey={userApiKey} handleApiKeyUpdate={handleApiKeyUpdate} />}
                {currentView === 'quiz' && (
                    <QuizView 
                        quizPool={quizPool} setQuizPool={setQuizPool}
                        usedQuizIds={usedQuizIds} setUsedQuizIds={setUsedQuizIds}
                        stats={stats} updateStats={updateStats} textClasses={textClasses}
                        apiKey={activeApiKey}
                    />
                )}
                {currentView === 'flashcard' && <FlashcardView textClasses={textClasses} />}
                {currentView === 'roadmap' && <RoadmapView stats={stats} updateStats={updateStats} textClasses={textClasses} />}
                {currentView === 'tutor' && <TutorView stats={stats} updateStats={updateStats} textClasses={textClasses} apiKey={activeApiKey} />}
                {currentView === 'guide' && <GuideView textClasses={textClasses} />}
            </main>
            </div>
        </div>
    );
}

// --- Navigation Item Component ---
function NavItem({ icon, label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center justify-center md:justify-start p-3 rounded-xl transition-colors ${
                active ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
            title={label}
        >
            {React.cloneElement(icon, { className: 'w-6 h-6 md:mr-3 shrink-0' })}
            <span className="hidden md:inline font-medium text-sm">{label}</span>
        </button>
    );
}

// --- Dashboard View ---
function DashboardView({ stats, updateStats, setUsedQuizIds, textClasses, userApiKey, handleApiKeyUpdate }) {
    const [showApiGuide, setShowApiGuide] = useState(false);
    
    const progressPercent = stats.totalAnswered > 0 ? (stats.correctAnswers / stats.totalAnswered) * 100 : 0;
    
    const totalRoadmapTasks = 15; // 5 levels * 3 tasks
    const completedRoadmapTasks = stats.roadmapProgress?.length || 0;
    const roadmapPercent = (completedRoadmapTasks / totalRoadmapTasks) * 100;

    const resetStats = () => {
        if(window.confirm('学習データ（模擬テストの回答履歴、日別スコア、学習時間）をリセットしますか？')) {
            updateStats({ ...initialStats, settings: stats.settings });
            setUsedQuizIds([]);
        }
    };

    const handleTextSizeChange = (size) => {
        updateStats({ ...stats, settings: { ...stats.settings, textSize: size } });
    };

    const handleThemeChange = (theme) => {
        updateStats({ ...stats, settings: { ...stats.settings, theme } });
    };
    
    const currentTheme = stats.settings?.theme || 'dark';
    const studyTimeObj = formatStudyTimeStr(stats.totalStudyTime);

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* APIキー未設定の場合のアラート */}
            {!userApiKey && (
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
                    <div className="flex items-start">
                        <Info className="w-6 h-6 text-blue-600 dark:text-blue-400 mr-3 shrink-0 mt-0.5" />
                        <div>
                            <h3 className={`font-bold text-blue-800 dark:text-blue-300 ${textClasses.base}`}>AI機能を利用するにはAPIキーが必要です</h3>
                            <p className={`text-blue-600 dark:text-blue-400 mt-1 ${textClasses.sm}`}>
                                テスト問題の自動作成やAIチューターを利用するには、Google GeminiのAPIキー（無料）の取得と設定が必要です。
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowApiGuide(true)}
                        className={`shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-lg transition-colors shadow-sm whitespace-nowrap ${textClasses.sm}`}
                    >
                        APIキーの取得方法
                    </button>
                </div>
            )}

            <h2 className={`font-bold mb-6 flex items-center ${textClasses.title}`}>
                <BarChart3 className="mr-2 text-blue-600 dark:text-blue-400" /> 学習の進捗状況
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
                <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center transition-colors text-center">
                    <p className={`text-gray-500 dark:text-gray-400 font-medium mb-1 ${textClasses.sm}`}>総合正答率</p>
                    <p className={`font-bold text-blue-600 dark:text-blue-400 ${textClasses.super}`}>{progressPercent.toFixed(1)}<span className={`font-normal ml-1 ${textClasses.sm}`}>%</span></p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center transition-colors text-center">
                    <p className={`text-gray-500 dark:text-gray-400 font-medium mb-1 ${textClasses.sm}`}>総学習時間</p>
                    <p className={`font-bold text-indigo-600 dark:text-indigo-400 ${textClasses.super}`}>{studyTimeObj.value}<span className={`font-normal ml-1 ${textClasses.sm}`}>{studyTimeObj.unit}</span></p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center transition-colors text-center">
                    <p className={`text-gray-500 dark:text-gray-400 font-medium mb-1 ${textClasses.sm}`}>回答済み問題</p>
                    <p className={`font-bold text-gray-800 dark:text-gray-100 ${textClasses.super}`}>{stats.totalAnswered}<span className={`font-normal ml-1 ${textClasses.sm}`}>問</span></p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center transition-colors text-center">
                    <p className={`text-gray-500 dark:text-gray-400 font-medium mb-1 ${textClasses.sm}`}>正解数</p>
                    <p className={`font-bold text-green-600 dark:text-green-400 ${textClasses.super}`}>{stats.correctAnswers}<span className={`font-normal ml-1 ${textClasses.sm}`}>問</span></p>
                </div>
            </div>

            {/* Roadmap Progress Widget */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-800/50 mb-8 transition-colors">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h3 className={`font-bold text-blue-800 dark:text-blue-300 flex items-center ${textClasses.xl}`}>
                            <Map className="mr-2 w-5 h-5" /> 学習ロードマップ進捗
                        </h3>
                        <p className={`text-blue-600/80 dark:text-blue-400/80 font-medium mt-1 ${textClasses.sm}`}>
                            全体の進み具合 ({completedRoadmapTasks} / {totalRoadmapTasks} 完了)
                        </p>
                    </div>
                    <p className={`font-bold text-blue-700 dark:text-blue-400 ${textClasses.big}`}>
                        {Math.round(roadmapPercent)}%
                    </p>
                </div>
                <div className="w-full bg-blue-200/50 dark:bg-blue-900/50 rounded-full h-3 mt-3">
                    <div className="bg-blue-600 dark:bg-blue-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${roadmapPercent}%` }}></div>
                </div>
            </div>

            {/* Calendar Widget */}
            <CalendarWidget dailyStats={stats.dailyStats} textClasses={textClasses} />

            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mt-8 transition-colors">
                <h3 className={`font-bold mb-4 ${textClasses.xl}`}>分野別の正答率</h3>
                <div className="space-y-4">
                    {DOMAINS.map((domain, idx) => {
                        const domainStat = stats.domainStats[domain];
                        const dPercent = domainStat.total > 0 ? (domainStat.correct / domainStat.total) * 100 : 0;
                        return (
                            <div key={idx}>
                                <div className={`flex justify-between mb-1 ${textClasses.sm}`}>
                                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate mr-2">{domain}</span>
                                    <span className="text-gray-500 dark:text-gray-400 shrink-0">
                                        {domainStat.correct} / {domainStat.total} ({dPercent.toFixed(0)}%)
                                    </span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3">
                                    <div className="bg-blue-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${dPercent}%` }}></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* App Settings */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mt-8 mb-8 transition-colors">
                <h3 className={`font-bold mb-4 flex items-center ${textClasses.xl}`}>
                    <Settings className="mr-2 text-blue-600 dark:text-blue-400" /> アプリ設定
                </h3>
                <div className="flex flex-col space-y-6">
                    <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
                        <div className="flex flex-col md:flex-row md:items-center gap-6">
                            
                            <div className="flex items-center gap-3">
                                <span className={`font-medium text-gray-700 dark:text-gray-300 ${textClasses.base}`}>テーマ:</span>
                                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                    <button
                                        onClick={() => handleThemeChange('light')}
                                        className={`px-4 py-2 rounded-md transition flex items-center gap-2 ${textClasses.sm} ${currentTheme === 'light' ? 'bg-white dark:bg-gray-600 shadow-sm font-bold text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                    >
                                        <Sun className="w-4 h-4" /> ライト
                                    </button>
                                    <button
                                        onClick={() => handleThemeChange('dark')}
                                        className={`px-4 py-2 rounded-md transition flex items-center gap-2 ${textClasses.sm} ${currentTheme === 'dark' ? 'bg-white dark:bg-gray-600 shadow-sm font-bold text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                    >
                                        <Moon className="w-4 h-4" /> ダーク
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className={`font-medium text-gray-700 dark:text-gray-300 ${textClasses.base}`}>文字サイズ:</span>
                                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                    {['sm', 'md', 'lg'].map(size => (
                                        <button
                                            key={size}
                                            onClick={() => handleTextSizeChange(size)}
                                            className={`px-4 py-2 rounded-md transition ${textClasses.sm} ${stats.settings?.textSize === size ? 'bg-white dark:bg-gray-600 shadow-sm font-bold text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                        >
                                            {size === 'sm' ? '小' : size === 'md' ? '中' : '大'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                        </div>
                        <button onClick={resetStats} className={`text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-4 py-2 rounded-lg transition flex items-center shrink-0 ${textClasses.sm}`}>
                            <RefreshCw className="w-4 h-4 mr-2" /> データをリセット
                        </button>
                    </div>
                    
                    {/* APIキー設定欄の追加 */}
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-start gap-4">
                        <span className={`font-medium text-gray-700 dark:text-gray-300 shrink-0 sm:mt-2 ${textClasses.base}`}>Gemini APIキー:</span>
                        <div className="flex-1 w-full max-w-lg">
                            <input 
                                type="password" 
                                value={userApiKey}
                                onChange={(e) => handleApiKeyUpdate(e.target.value)}
                                placeholder="AI機能を使う場合に入力してください"
                                className={`p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full transition-colors shadow-inner ${textClasses.base}`}
                            />
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                                ※取得したAPIキーはお使いのブラウザ（ローカル環境）にのみ保存され、安全にAPIリクエストにのみ使用されます。模擬テストの自動生成とAIチューター機能を利用するには設定が必要です。
                                <button 
                                    onClick={() => setShowApiGuide(true)} 
                                    className="text-blue-600 dark:text-blue-400 hover:underline font-bold ml-1 inline-flex items-center"
                                >
                                    <Info className="w-3 h-3 mr-1" />APIキーの取得方法はこちら
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* API Key Guide Modal */}
            {showApiGuide && <ApiKeyGuideModal onClose={() => setShowApiGuide(false)} textClasses={textClasses} />}
        </div>
    );
}

// --- API Key Guide Modal Component ---
function ApiKeyGuideModal({ onClose, textClasses }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-gray-100 dark:border-gray-700 flex flex-col max-h-[90vh]">
                <div className="p-4 md:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                    <h3 className={`font-bold text-gray-800 dark:text-gray-100 flex items-center ${textClasses.lg}`}>
                        <Key className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" /> Gemini APIキーの取得方法
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6 text-gray-700 dark:text-gray-300">
                    <p className={`${textClasses.base} leading-relaxed`}>
                        当アプリのAI機能（模擬テスト作成、AIチューター）は、Googleの最新AI「Gemini」を利用しています。個人利用の範囲であれば<strong>無料</strong>・<strong>クレジットカード登録不要</strong>でAPIキーを取得できます。
                    </p>
                    
                    <div className="space-y-5">
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">1</div>
                            <div>
                                <h4 className={`font-bold text-gray-800 dark:text-gray-200 ${textClasses.base}`}>Google AI Studio にアクセス</h4>
                                <p className={`mt-1 mb-2 ${textClasses.sm}`}>ブラウザでGoogle AI StudioのAPIキー取得ページを開きます。</p>
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className={`inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline font-bold bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg transition-colors ${textClasses.sm}`}>
                                    Google AI Studioを開く <ExternalLink className="w-4 h-4 ml-1" />
                                </a>
                            </div>
                        </div>
                        
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">2</div>
                            <div>
                                <h4 className={`font-bold text-gray-800 dark:text-gray-200 ${textClasses.base}`}>Googleアカウントでログイン</h4>
                                <p className={`mt-1 ${textClasses.sm}`}>普段お使いのGoogleアカウントでログインしてください。</p>
                            </div>
                        </div>
                        
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">3</div>
                            <div>
                                <h4 className={`font-bold text-gray-800 dark:text-gray-200 ${textClasses.base}`}>APIキーを作成</h4>
                                <p className={`mt-1 ${textClasses.sm}`}>
                                    画面右上の「APIキーを作成」（Create API Key）をクリックしてキーを作成します。<br />
                                    <span className="text-gray-500 dark:text-gray-400 text-xs mt-1 inline-block">
                                        ※プロジェクトを選択のプルダウンは、特にこだわりがなければ、「新しいプロジェクトを作成する」を選べばOKです。<br />
                                        ※キー名の設定は、任意の名前（例：AWS学習アプリ等なんでも可）を入力してください。
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">4</div>
                            <div>
                                <h4 className={`font-bold text-gray-800 dark:text-gray-200 ${textClasses.base}`}>キーをコピーしてアプリに入力</h4>
                                <p className={`mt-1 ${textClasses.sm}`}>「AQ.Ab...」から始まる文字列が表示されます。「Copy」を押してコピーし、当アプリの「アプリ設定 ＞ Gemini APIキー」の入力欄に貼り付けます。</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl mt-6">
                        <p className={`text-amber-800 dark:text-amber-400 font-bold flex items-center mb-1 ${textClasses.sm}`}>
                            <AlertCircle className="w-5 h-5 mr-1" /> 注意事項
                        </p>
                        <ul className={`text-amber-900 dark:text-amber-200 list-disc pl-5 space-y-1 ${textClasses.sm}`}>
                            <li>取得したAPIキーは他人に教えたり、公開される場所に貼り付けないでください。</li>
                            <li>このアプリに入力されたキーは、あなたのブラウザにのみ保存され安全に管理されます。</li>
                        </ul>
                    </div>
                </div>
                
                <div className="p-4 md:p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-900/50">
                    <button onClick={onClose} className={`px-6 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-lg transition-colors shadow-sm ${textClasses.base}`}>
                        閉じる
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Calendar Widget Component ---
function CalendarWidget({ dailyStats, textClasses }) {
    const todayStr = formatDateStr(new Date());
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(todayStr);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const startDayOfWeek = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();

    const days = Array(startDayOfWeek).fill(null);
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(formatDateStr(new Date(year, month, i)));
    }

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

    const selectedData = dailyStats[selectedDate] || { answered: 0, correct: 0, studyTime: 0 };
    const hasData = selectedData.answered > 0 || selectedData.studyTime > 0;

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mt-8 transition-colors">
            <h3 className={`font-bold mb-4 flex items-center ${textClasses.xl}`}>
                <Calendar className="mr-2 text-blue-600 dark:text-blue-400" /> 学習カレンダー
            </h3>
            
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                {/* Calendar Grid */}
                <div className="flex-1 max-w-sm mx-auto w-full">
                    <div className="flex justify-between items-center mb-4 text-gray-800 dark:text-gray-100">
                        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"><ChevronLeft className="w-5 h-5"/></button>
                        <span className={`font-bold ${textClasses.lg}`}>{year}年 {month + 1}月</span>
                        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"><ChevronRight className="w-5 h-5"/></button>
                    </div>
                    <div className={`grid grid-cols-7 gap-1 text-center font-bold text-gray-400 dark:text-gray-500 mb-2 ${textClasses.sm}`}>
                        <div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 sm:gap-2">
                        {days.map((dateStr, idx) => {
                            if (!dateStr) return <div key={idx} className="h-8 sm:h-10"></div>;
                            
                            const dayData = dailyStats[dateStr];
                            const isSelected = dateStr === selectedDate;
                            const isToday = dateStr === todayStr;
                            
                            let bgColor = "bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300";
                            if (dayData) {
                                // 学習時間または回答数に応じてカレンダーに色をつける
                                if (dayData.answered >= 10 || dayData.studyTime >= 3600) bgColor = "bg-green-500 dark:bg-green-600 text-white shadow-sm";
                                else if (dayData.answered >= 5 || dayData.studyTime >= 1800) bgColor = "bg-green-400 dark:bg-green-500 text-white";
                                else if (dayData.answered > 0 || dayData.studyTime > 0) bgColor = "bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100";
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedDate(dateStr)}
                                    className={`h-8 sm:h-10 w-full rounded-md flex items-center justify-center transition-all ${textClasses.sm}
                                        ${bgColor} 
                                        ${isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 dark:ring-offset-gray-800 font-bold transform scale-110 z-10' : ''}
                                        ${!dayData && isToday ? 'border border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : ''}
                                    `}
                                    title={`${dateStr.replace(/-/g, '/')} - ${dayData ? `回答: ${dayData.answered || 0}問 / 学習: ${formatStudyTimeStr(dayData.studyTime).full}` : '記録なし'}`}
                                >
                                    {parseInt(dateStr.split('-')[2], 10)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Selected Date Details */}
                <div className="w-full lg:w-64 bg-gray-50 dark:bg-gray-900/50 rounded-xl p-5 border border-gray-100 dark:border-gray-700 flex flex-col justify-center text-center lg:text-left transition-colors">
                    <p className={`text-gray-500 dark:text-gray-400 font-bold mb-2 ${textClasses.sm}`}>{selectedDate.replace(/-/g, '/')}</p>
                    {hasData ? (
                        <>
                            <div className="mb-4">
                                <p className={`font-bold text-gray-800 dark:text-gray-100 ${textClasses.big}`}>
                                    {selectedData.answered || 0}<span className={`text-gray-500 dark:text-gray-400 font-normal ml-1 ${textClasses.sm}`}>問 回答</span>
                                </p>
                            </div>
                            <div className="mb-4">
                                <p className={`font-medium text-gray-500 dark:text-gray-400 ${textClasses.sm}`}>正解数</p>
                                <p className={`font-bold text-green-600 dark:text-green-400 ${textClasses.xl}`}>
                                    {selectedData.correct || 0}<span className={`text-green-600/70 dark:text-green-400/70 ml-1 ${textClasses.sm}`}>問</span>
                                </p>
                            </div>
                            <div className="mb-4">
                                <p className={`font-medium text-gray-500 dark:text-gray-400 flex items-center justify-center lg:justify-start ${textClasses.sm}`}>
                                    <Clock className="w-4 h-4 mr-1" /> 学習時間
                                </p>
                                <p className={`font-bold text-indigo-600 dark:text-indigo-400 ${textClasses.xl}`}>
                                    {formatStudyTimeStr(selectedData.studyTime).full}
                                </p>
                            </div>
                            {selectedData.answered > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <p className={`text-gray-500 dark:text-gray-400 ${textClasses.sm}`}>正答率: {Math.round(((selectedData.correct || 0) / selectedData.answered) * 100)}%</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="py-8 text-center text-gray-400 dark:text-gray-500">
                            <p className={`font-medium ${textClasses.base}`}>学習データがありません</p>
                            <p className={`mt-2 ${textClasses.sm}`}>この日はまだ学習していません</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Quiz View (模擬テスト) ---
function QuizView({ quizPool, setQuizPool, usedQuizIds, setUsedQuizIds, stats, updateStats, textClasses, apiKey }) {
    const [generating, setGenerating] = useState(false);
    const [difficulty, setDifficulty] = useState('初級'); // ここを'初級'に設定
    const [selectedDomain, setSelectedDomain] = useState('all');
    const [selectedTask, setSelectedTask] = useState('all');
    
    // --- 履歴管理のためのステート ---
    const [sessionHistory, setSessionHistory] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    const currentItem = sessionHistory[currentIndex];
    const currentQuiz = currentItem ? currentItem.quiz : null;
    const selectedOption = currentItem ? currentItem.selectedOption : null;
    const isAnswered = selectedOption !== null && selectedOption !== undefined;

    // 分野が変更されたらタスクの絞り込みをリセットする
    useEffect(() => {
        setSelectedTask('all');
    }, [selectedDomain]);

    // 未解答の新しい問題を取得・セットするロジック
    useEffect(() => {
        if (!currentQuiz) {
            let targetPool = quizPool.filter(q => !usedQuizIds.includes(q.id));
            
            // 分野で絞り込み
            if (selectedDomain !== 'all') {
                targetPool = targetPool.filter(q => q.domain === selectedDomain);
                // タスクで絞り込み
                if (selectedTask !== 'all') {
                    targetPool = targetPool.filter(q => q.task_id === selectedTask);
                }
            }

            if (targetPool.length > 0) {
                const nextQuiz = targetPool[Math.floor(Math.random() * targetPool.length)];
                setSessionHistory(prev => {
                    const newHistory = [...prev];
                    newHistory[currentIndex] = { quiz: nextQuiz, selectedOption: null };
                    return newHistory;
                });
            }
        }
    }, [currentQuiz, currentIndex, selectedDomain, selectedTask, quizPool, usedQuizIds]);

    const handleOptionClick = (idx) => {
        if (isAnswered || !currentQuiz) return;
        
        // 解答を履歴に保存
        setSessionHistory(prev => {
            const newHistory = [...prev];
            newHistory[currentIndex] = { ...newHistory[currentIndex], selectedOption: idx };
            return newHistory;
        });

        const isCorrect = idx === currentQuiz.answerIndex;

        const newStats = { ...stats };
        newStats.totalAnswered += 1;
        if (isCorrect) newStats.correctAnswers += 1;
        
        // Domain
        let domainKey = currentQuiz.domain;
        if(!DOMAINS.includes(domainKey)) {
             domainKey = DOMAINS.find(d => currentQuiz.domain.includes(d.split(':')[0])) || DOMAINS[0];
        }
        if (newStats.domainStats[domainKey]) {
            newStats.domainStats[domainKey].total += 1;
            if (isCorrect) newStats.domainStats[domainKey].correct += 1;
        }

        // Daily
        const today = formatDateStr(new Date());
        if (!newStats.dailyStats) newStats.dailyStats = {};
        if (!newStats.dailyStats[today]) newStats.dailyStats[today] = { answered: 0, correct: 0, studyTime: 0 };
        newStats.dailyStats[today].answered += 1;
        if (isCorrect) newStats.dailyStats[today].correct += 1;

        updateStats(newStats);
        setUsedQuizIds(prev => [...prev, currentQuiz.id]);
    };

    const handleNext = () => {
        setCurrentIndex(prev => prev + 1);
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const generateQuizzes = async (count) => {
        if (!apiKey && !isCanvasEnv) {
            alert("Gemini APIキーが設定されていません。ダッシュボードの設定画面からAPIキーを入力してください。");
            return;
        }
        
        setGenerating(true);
        try {
            let domainInstruction = "";
            let taskInstruction = "";

            if (selectedDomain !== 'all') {
                domainInstruction = `【重要指示】出題分野は「${selectedDomain}」に関するものに完全に限定してください。他の分野のサービスを正解とする問題は作成しないでください。domainフィールドは必ず "${selectedDomain}" に設定してください。`;
                if (selectedTask !== 'all') {
                     const taskLabel = TASKS_BY_DOMAIN[selectedDomain].find(t => t.id === selectedTask)?.title;
                     taskInstruction = `【最重要指示】出題内容は、タスク「${taskLabel}」に直接関連する知識に厳密に限定してください。task_idフィールドは必ず "${selectedTask}" に設定してください。`;
                } else {
                     // 特定分野の全タスクからランダムに指定数を選出してAIに指示
                     const domainTasks = TASKS_BY_DOMAIN[selectedDomain];
                     const shuffled = [...domainTasks].sort(() => 0.5 - Math.random());
                     const targetTasks = shuffled.slice(0, count);
                     const targetTaskLabels = targetTasks.map(t => t.title).join(" / ");
                     taskInstruction = `【最重要指示】以下のタスクテーマに関連する問題を必ず作成してください: ${targetTaskLabels}。task_idフィールドには該当するタスクIDを正確に設定してください。`;
                }
            } else {
                // 全分野からランダムに指定数を選出してAIに指示することで偏りを防ぐ
                const allTasks = Object.values(TASKS_BY_DOMAIN).flat();
                const shuffledTasks = [...allTasks].sort(() => 0.5 - Math.random());
                const targetTasks = shuffledTasks.slice(0, count);
                const targetTaskLabels = targetTasks.map(t => t.title).join(" / ");
                
                domainInstruction = `【重要指示】出題分野(domain)は必ず以下を使用: "第1分野: クラウドのコンセプト", "第2分野: セキュリティとコンプライアンス", "第3分野: クラウドテクノロジーとサービス", "第4分野: 請求、料金、サポート"`;
                taskInstruction = `【最重要指示】特定のサービスに偏らないようにするため、今回は以下のタスクテーマに沿った問題を必ず作成してください。\n指定タスク: ${targetTaskLabels}\ntask_idフィールドには該当するタスクIDを正確に設定してください。`;
            }

            const systemPrompt = `あなたはAWS認定クラウドプラクティショナー(CLF-C02)の試験問題作成プロフェッショナルです。
模擬テストを${count}問作成してください。難易度は「${difficulty}」です。

【出題ルールの定義】
- 初級: AWSの基本的な用語、サービスの目的、概念をストレートに問う問題。
- 中級: CLF-C02本試験の標準レベル。ユースケースに基づく適切なサービスの選択や、責任共有モデル等を問う問題。
- 上級: CLF-C02本試験における難問レベル。複数のサービスを組み合わせたビジネスシナリオ、特定の制約における最適なソリューション等を問う問題。

【選択肢（ディストラクター）の作成ルール】
- 架空のサービス名は絶対に作成せず、すべて実在するAWSの公式サービス名（Amazon 〜, AWS 〜）を使用すること。
- 上級問題のみ正解と目的が似ているサービス（例：S3とEBS、RDSとDynamoDB、WAFとShieldなど）を意図的に配置し、受験者が違いを正しく理解しているか問う構成にすること。」

【解説（explanation）のルール】
- 正解の理由だけでなく、**必ず「他のすべての不正解の選択肢がなぜ間違っているのか」の具体的な理由も含めて**詳しく記載してください。

出力は必ず以下のJSONスキーマに従う配列形式にしてください。
${domainInstruction}
${taskInstruction}
`;
            const payload = {
                contents: [{ parts: [{ text: `CLF-C02の模擬テストを作成してください（${count}問、難易度：${difficulty}）` }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                question: { type: "STRING" },
                                options: { type: "ARRAY", items: { type: "STRING" } },
                                answerIndex: { type: "INTEGER" },
                                explanation: { type: "STRING" },
                                domain: { type: "STRING" },
                                task_id: { type: "STRING", description: "関連するタスクID（例: '1.1', '2.3'）" }
                            },
                            required: ["question", "options", "answerIndex", "explanation", "domain", "task_id"]
                        }
                    }
                }
            };

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModelText(apiKey)}:generateContent?key=${apiKey}`;
            const result = await fetchWithRetry(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("Empty response");
            
            const json = JSON.parse(text);
            const newQuizzes = json.map(q => ({
                ...q, 
                id: crypto.randomUUID(),
                // AIがタグ付けを間違えた場合でも、現在選択している条件を強制適用してフィルタリング漏れを防ぐ
                domain: selectedDomain !== 'all' ? selectedDomain : q.domain,
                task_id: selectedTask !== 'all' ? selectedTask : q.task_id
            }));
            
            setQuizPool(prev => [...prev, ...newQuizzes]);
        } catch (error) {
            console.error("Quiz gen fail:", error);
            alert("問題の生成に失敗しました。時間をおいて再試行してください。");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto h-full flex flex-col animate-in fade-in duration-300">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                <h2 className={`font-bold flex items-center shrink-0 ${textClasses.title}`}>
                    <HelpCircle className="mr-2 text-blue-600 dark:text-blue-400" /> 模擬テスト
                </h2>
                
                <div className={`flex flex-wrap items-center bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors gap-y-2 gap-x-2 ${textClasses.sm}`}>
                    <div className="flex items-center px-2">
                        <span className="font-medium text-gray-600 dark:text-gray-300 mr-2 shrink-0">難易度:</span>
                        <select 
                            value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={generating}
                            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-500 transition-colors"
                        >
                            <option value="初級">初級</option>
                            <option value="中級">中級</option>
                            <option value="上級">上級</option>
                        </select>
                    </div>
                    <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-600 transition-colors"></div>
                    <div className="flex items-center px-2">
                        <span className="font-medium text-gray-600 dark:text-gray-300 mr-2 shrink-0">分野:</span>
                        <select 
                            value={selectedDomain} onChange={(e) => setSelectedDomain(e.target.value)} disabled={generating}
                            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-500 transition-colors max-w-[140px] sm:max-w-xs truncate"
                        >
                            <option value="all">全分野からランダム</option>
                            <option value="第1分野: クラウドのコンセプト">第1分野 (コンセプト)</option>
                            <option value="第2分野: セキュリティとコンプライアンス">第2分野 (セキュリティ)</option>
                            <option value="第3分野: クラウドテクノロジーとサービス">第3分野 (テクノロジー)</option>
                            <option value="第4分野: 請求、料金、サポート">第4分野 (請求・サポート)</option>
                        </select>
                    </div>
                    <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-600 transition-colors"></div>
                    <div className="flex items-center px-2">
                        <span className="font-medium text-gray-600 dark:text-gray-300 mr-2 shrink-0">タスク:</span>
                        <select 
                            value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)} disabled={generating || selectedDomain === 'all'}
                            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-500 transition-colors max-w-[140px] sm:max-w-xs truncate disabled:opacity-50"
                        >
                            <option value="all">{selectedDomain === 'all' ? '分野を選択してください' : 'すべてのタスク'}</option>
                            {selectedDomain !== 'all' && TASKS_BY_DOMAIN[selectedDomain].map(task => (
                                <option key={task.id} value={task.id}>{task.title}</option>
                            ))}
                        </select>
                    </div>
                    <div className="hidden lg:block w-px h-6 bg-gray-200 dark:bg-gray-600 transition-colors"></div>
                    <div className="flex items-center px-2 w-full lg:w-auto mt-2 lg:mt-0">
                        <span className="font-medium text-gray-600 dark:text-gray-300 mr-2 shrink-0">作成:</span>
                        <div className="flex space-x-2">
                            {[1, 5, 10].map(num => (
                                <button
                                    key={num} onClick={() => generateQuizzes(num)} disabled={generating}
                                    className="px-3 py-1 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-md font-medium transition disabled:opacity-50 shrink-0"
                                >
                                    {num}問
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pb-8">
                {generating ? (
                    <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center h-64 transition-colors">
                        <Loader2 className="w-10 h-10 text-blue-500 dark:text-blue-400 animate-spin mb-4" />
                        <p className={`text-gray-600 dark:text-gray-300 font-medium ${textClasses.base}`}>AIが新しい問題を作成しています...</p>
                    </div>
                ) : !currentQuiz ? (
                    <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center transition-colors">
                        <HelpCircle className="w-12 h-12 text-blue-400 dark:text-blue-500 mb-4" />
                        <h3 className={`font-bold mb-2 ${textClasses.xl}`}>問題を作成しましょう</h3>
                        <p className={`text-gray-500 dark:text-gray-400 mb-6 ${textClasses.base}`}>上のメニューから難易度や分野を選び、「作成」ボタンを押して新しい問題を作成してください。</p>
                        <button onClick={() => generateQuizzes(5)} className={`px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 font-medium flex items-center transition ${textClasses.base}`}>
                            <Plus className="w-5 h-5 mr-2" /> 5問作成する
                        </button>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <div className="mb-6 flex justify-between items-start">
                            <div>
                                <span className={`inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-semibold mb-4 border border-gray-200 dark:border-gray-600 transition-colors ${textClasses.sm}`}>
                                    {currentQuiz.domain} {currentQuiz.task_id && `- タスク ${currentQuiz.task_id}`}
                                </span>
                                <h3 className={`font-bold leading-relaxed ${textClasses.xl}`}>{currentQuiz.question}</h3>
                            </div>
                            <span className={`text-gray-400 dark:text-gray-500 font-bold shrink-0 ml-4 ${textClasses.sm}`}>Q. {currentIndex + 1}</span>
                        </div>

                        <div className="space-y-3">
                            {currentQuiz.options.map((opt, idx) => {
                                const isSelected = selectedOption === idx;
                                const isCorrect = idx === currentQuiz.answerIndex;
                                let btnClass = "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-500";
                                if (isAnswered) {
                                    if (isCorrect) btnClass = "bg-green-50 dark:bg-green-900/30 border-green-500 text-green-900 dark:text-green-100 font-medium";
                                    else if (isSelected && !isCorrect) btnClass = "bg-red-50 dark:bg-red-900/30 border-red-400 text-red-900 dark:text-red-100";
                                    else btnClass = "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-50";
                                }
                                return (
                                    <button
                                        key={idx} onClick={() => handleOptionClick(idx)} disabled={isAnswered}
                                        className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start ${btnClass} ${textClasses.base}`}
                                    >
                                        <span className="shrink-0 inline-block w-8 font-bold text-gray-400 dark:text-gray-500">{String.fromCharCode(65 + idx)}.</span>
                                        <span className="flex-1">{opt}</span>
                                        {isAnswered && isCorrect && <CheckCircle className="w-6 h-6 text-green-500 shrink-0 ml-2" />}
                                        {isAnswered && isSelected && !isCorrect && <XCircle className="w-6 h-6 text-red-400 dark:text-red-500 shrink-0 ml-2" />}
                                    </button>
                                );
                            })}
                        </div>

                        {!isAnswered && currentIndex > 0 && (
                            <div className="mt-6 flex justify-start">
                                <button onClick={handlePrev} className={`px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-bold flex items-center shadow-sm transition ${textClasses.base}`}>
                                    <ChevronLeft className="mr-1 w-5 h-5" /> 前の問題に戻る
                                </button>
                            </div>
                        )}

                        {isAnswered && (
                            <div className="mt-8 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className={`p-5 rounded-xl border transition-colors ${selectedOption === currentQuiz.answerIndex ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                                    <div className="flex items-center mb-3">
                                        {selectedOption === currentQuiz.answerIndex ? (
                                            <><CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 mr-2" /> <span className={`font-bold text-green-800 dark:text-green-300 ${textClasses.lg}`}>正解！</span></>
                                        ) : (
                                            <><XCircle className="w-6 h-6 text-red-600 dark:text-red-400 mr-2" /> <span className={`font-bold text-red-800 dark:text-red-300 ${textClasses.lg}`}>不正解</span></>
                                        )}
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-4 md:p-5 rounded-lg border border-gray-100/50 dark:border-gray-700 shadow-sm transition-colors">
                                        <p className={`text-gray-500 dark:text-gray-400 font-bold mb-2 ${textClasses.sm}`}>解説:</p>
                                        <p className={`text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap ${textClasses.base}`}>{currentQuiz.explanation}</p>
                                    </div>
                                </div>
                                <div className="mt-6 flex justify-between items-center">
                                    <button onClick={handlePrev} disabled={currentIndex === 0} className={`px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-bold flex items-center shadow-sm transition disabled:opacity-0 disabled:pointer-events-none ${textClasses.base}`}>
                                        <ChevronLeft className="mr-1 w-5 h-5" /> 前の問題に戻る
                                    </button>
                                    <button onClick={handleNext} className={`px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-xl hover:bg-blue-700 dark:hover:bg-blue-600 font-bold flex items-center shadow-sm transition ${textClasses.base}`}>
                                        次の問題へ <ChevronRight className="ml-1 w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Flashcard View (単語カード) ---
function FlashcardView({ textClasses }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [level, setLevel] = useState('初級');
    const [selectedDomain, setSelectedDomain] = useState('all');

    // 選択された分野でカードを絞り込む
    const filteredCards = selectedDomain === 'all' 
        ? FLASHCARDS 
        : FLASHCARDS.filter(card => card.domain === selectedDomain);

    // 分野が変更されたら最初のカードに戻す
    useEffect(() => {
        setCurrentIndex(0);
        setIsFlipped(false);
    }, [selectedDomain]);

    // 万が一空になった場合のフォールバック（通常は発生しない）
    const card = filteredCards[currentIndex] || FLASHCARDS[0];

    const nextCard = () => { setIsFlipped(false); setTimeout(() => setCurrentIndex(p => (p + 1) % filteredCards.length), 150); };
    const prevCard = () => { setIsFlipped(false); setTimeout(() => setCurrentIndex(p => (p - 1 + filteredCards.length) % filteredCards.length), 150); };

    return (
        <div className="max-w-3xl mx-auto h-full flex flex-col justify-center animate-in fade-in duration-300">
             <div className="text-center mb-6 md:mb-8">
                <h2 className={`font-bold flex items-center justify-center ${textClasses.title}`}>
                    <BookOpen className="mr-2 text-blue-600 dark:text-blue-400" /> 単語カード
                </h2>
                
                {/* 難易度切り替えと分野絞り込み */}
                <div className="flex flex-col items-center mt-4 space-y-4">
                    <div className="bg-gray-200 dark:bg-gray-700 p-1 rounded-lg inline-flex shadow-inner transition-colors">
                        <button 
                            onClick={() => setLevel('初級')} 
                            className={`px-4 py-1.5 rounded-md font-bold transition-all ${level === '初級' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'} ${textClasses.sm}`}
                        >
                            🔰 初級者向け解説
                        </button>
                        <button 
                            onClick={() => setLevel('中級')} 
                            className={`px-4 py-1.5 rounded-md font-bold transition-all ${level === '中級' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'} ${textClasses.sm}`}
                        >
                            🎓 中級者向け解説
                        </button>
                    </div>

                    <div className="flex items-center">
                        <span className={`font-medium text-gray-600 dark:text-gray-300 mr-2 shrink-0 ${textClasses.sm}`}>分野で絞り込む:</span>
                        <select 
                            value={selectedDomain} 
                            onChange={(e) => setSelectedDomain(e.target.value)}
                            className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md px-3 py-1.5 outline-none focus:border-blue-500 transition-colors shadow-sm max-w-[200px] sm:max-w-xs truncate ${textClasses.sm}`}
                        >
                            <option value="all">全分野</option>
                            <option value="第1分野: クラウドのコンセプト">第1分野 (コンセプト)</option>
                            <option value="第2分野: セキュリティとコンプライアンス">第2分野 (セキュリティ)</option>
                            <option value="第3分野: クラウドテクノロジーとサービス">第3分野 (テクノロジー)</option>
                            <option value="第4分野: 請求、料金、サポート">第4分野 (請求・サポート)</option>
                        </select>
                    </div>
                </div>
            </div>

            {filteredCards.length > 0 ? (
                <>
                    <div 
                        className="w-full max-w-lg min-h-[24rem] mx-auto cursor-pointer bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-2xl shadow-md p-6 md:p-8 transition-all duration-300 relative flex flex-col justify-center"
                        onClick={() => setIsFlipped(!isFlipped)}
                        style={{ transform: isFlipped ? 'scale(1.02)' : 'scale(1)' }}
                    >
                        <div className={`absolute top-4 right-4 font-bold text-gray-300 dark:text-gray-600 ${textClasses.sm}`}>
                            {currentIndex + 1} / {filteredCards.length}
                        </div>
                        
                        {isFlipped ? (
                            <div className="animate-in zoom-in-95 duration-200 w-full h-full flex flex-col justify-between text-left">
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className={`text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider ${textClasses.sm}`}>
                                            解説 ({level})
                                        </span>
                                    </div>
                                    <p className={`text-gray-800 dark:text-gray-100 leading-relaxed font-medium ${textClasses.base}`}>
                                        {level === '初級' ? card.beginnerDesc : card.intermediateDesc}
                                    </p>
                                </div>
                                
                                <div className="mt-auto bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 md:p-5 transition-colors">
                                    <p className={`text-amber-800 dark:text-amber-400 font-bold flex items-center mb-2 ${textClasses.sm}`}>
                                        <AlertCircle className="w-5 h-5 mr-1 shrink-0" /> 試験ではこう出る！
                                    </p>
                                    <p className={`text-amber-900 dark:text-amber-200 leading-relaxed font-medium ${textClasses.sm}`}>
                                        {card.examTip}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="animate-in zoom-in-95 duration-200 w-full text-center">
                                <p className={`text-gray-400 dark:text-gray-500 font-bold mb-3 uppercase tracking-wider ${textClasses.sm}`}>用語</p>
                                <h3 className={`font-bold text-blue-900 dark:text-blue-100 ${textClasses.title}`}>{card.term}</h3>
                                <p className={`text-gray-400 dark:text-gray-500 mt-8 animate-pulse ${textClasses.sm}`}>クリックして裏返す</p>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-center items-center mt-8 space-x-6">
                        <button onClick={prevCard} className="p-4 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition text-gray-600 dark:text-gray-300"><ChevronLeft className="w-6 h-6" /></button>
                        <div className="h-2 w-32 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-300" style={{ width: `${((currentIndex + 1) / filteredCards.length) * 100}%` }}></div>
                        </div>
                        <button onClick={nextCard} className="p-4 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition text-gray-600 dark:text-gray-300"><ChevronRight className="w-6 h-6" /></button>
                    </div>
                </>
            ) : (
                <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className={`text-gray-500 dark:text-gray-400 ${textClasses.base}`}>この分野のカードは現在登録されていません。</p>
                </div>
            )}
        </div>
    );
}

// --- AI Tutor View (AIチューター（質問）) ---
function TutorView({ stats, updateStats, textClasses, apiKey }) {
    const [mode, setMode] = useState('guide'); // 'guide' or 'qna'
    
    // Firestoreに保存された履歴（または初期値）を使用
    const activeMessages = stats.tutorHistory?.[mode] || initialStats.tutorHistory[mode];
    
    const setActiveMessages = (newMessagesOrUpdater) => {
        const updatedMessages = typeof newMessagesOrUpdater === 'function' 
            ? newMessagesOrUpdater(activeMessages) 
            : newMessagesOrUpdater;
            
        updateStats({
            ...stats,
            tutorHistory: {
                ...stats.tutorHistory,
                [mode]: updatedMessages
            }
        });
    };

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [activeMessages, isLoading, mode]);

    const handleSend = async (eOrText) => {
        if (eOrText && eOrText.preventDefault) eOrText.preventDefault();
        
        const textToSend = typeof eOrText === 'string' ? eOrText : input;
        if (!textToSend.trim() || isLoading) return;
        
        if (!apiKey && !isCanvasEnv) {
            alert("Gemini APIキーが設定されていません。ダッシュボードの設定画面からAPIキーを入力してください。");
            return;
        }

        setInput('');
        setActiveMessages(prev => [...prev, { role: 'user', text: textToSend }]);
        setIsLoading(true);

        try {
            const contents = activeMessages.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] }));
            contents.push({ role: 'user', parts: [{ text: textToSend }] });

            let systemPrompt = "";
            if (mode === 'guide') {
                systemPrompt = `あなたはAWS認定クラウドプラクティショナー(CLF-C02)の優秀な専属チューターです。ユーザーを合格まで伴走して導きます。
以下のルールに必ず従ってください：
1. ユーザーのペースに合わせて、ステップ・バイ・ステップで対話形式で教えること。長文で一気に説明しないこと。
2. 1つのトピック（例：スケーラビリティ）を説明したら、「ここまでは理解できましたか？」と確認するか、簡単な理解度チェッククイズを1問出題してユーザーの返答を待つこと。
3. ユーザーが正解したら褒めて次のトピックへ進み、間違えたら優しく解説すること。
4. 常に励まし、モチベーションを高める言葉をかけること。重要なキーワードは**太字**にして強調してください。`;
            } else {
                systemPrompt = "あなたはAWS認定クラウドプラクティショナー(CLF-C02)の親切で優秀なAIチューターです。ユーザーの疑問に日本語で簡潔に、わかりやすく答えてください。重要な用語は**太字**にして強調してください。";
            }

            const payload = { contents, systemInstruction: { parts: [{ text: systemPrompt }] } };
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModelText(apiKey)}:generateContent?key=${apiKey}`;
            const result = await fetchWithRetry(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

            const replyText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (replyText) setActiveMessages(prev => [...prev, { role: 'model', text: replyText }]);
        } catch (error) {
            setActiveMessages(prev => [...prev, { role: 'model', text: '申し訳ありません、エラーが発生しました。時間をおいてもう一度お試しください。' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        if (window.confirm('このモードの会話履歴をリセットしますか？')) {
            setActiveMessages(initialStats.tutorHistory[mode]);
        }
    };

    // 簡単なマークダウン（太字と改行）のパース関数
    const renderFormattedText = (text) => {
        return text.split('\n').map((line, i) => (
            <React.Fragment key={i}>
                {line.split(/(\*\*.*?\*\*)/g).map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={j} className="font-bold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>;
                    }
                    return <span key={j}>{part}</span>;
                })}
                {i !== text.split('\n').length - 1 && <br />}
            </React.Fragment>
        ));
    };

    const qnaSuggestions = [
        "EC2とS3の違いは？", "責任共有モデルについて教えて", "模擬テストの問題を1問出して"
    ];
    const guideSuggestions = [
        "👍 理解しました！次へ進んでください", "🤔 もう少し詳しく教えてください"
    ];
    const currentSuggestions = mode === 'guide' ? guideSuggestions : qnaSuggestions;

    return (
        <div className="max-w-3xl mx-auto h-full flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in duration-300 transition-colors">
            
            {/* Header & Tabs */}
            <div className="bg-blue-600 dark:bg-blue-700 text-white flex flex-col transition-colors z-10 shadow-sm relative">
                <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center">
                        <MessageSquare className="w-6 h-6 mr-2" />
                        <h2 className={`font-bold ${textClasses.lg}`}>AIチューター</h2>
                    </div>
                    <button 
                        onClick={handleReset} 
                        className="p-2 text-blue-100 hover:bg-blue-800 dark:hover:bg-blue-900 rounded-lg transition-colors flex items-center"
                        title="会話を最初からやり直す"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex bg-blue-700 dark:bg-blue-800 text-sm font-medium">
                    <button 
                        onClick={() => setMode('guide')}
                        className={`flex-1 py-3 flex items-center justify-center transition-colors ${mode === 'guide' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-t-2 border-blue-500' : 'text-blue-100 hover:bg-blue-600 dark:hover:bg-blue-700'}`}
                    >
                        <PlayCircle className="w-4 h-4 mr-2" /> ガイド学習モード
                    </button>
                    <button 
                        onClick={() => setMode('qna')}
                        className={`flex-1 py-3 flex items-center justify-center transition-colors ${mode === 'qna' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-t-2 border-blue-500' : 'text-blue-100 hover:bg-blue-600 dark:hover:bg-blue-700'}`}
                    >
                        <MessageSquare className="w-4 h-4 mr-2" /> 自由に質問する
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-6 transition-colors ${mode === 'guide' ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : 'bg-gray-50/50 dark:bg-gray-900/50'}`}>
                {mode === 'guide' && activeMessages.length === 1 && (
                    <div className="mb-6 p-4 bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-800/50 shadow-sm rounded-xl text-center transition-colors animate-in fade-in slide-in-from-top-2">
                        <p className={`text-indigo-800 dark:text-indigo-400 font-bold ${textClasses.sm}`}>💡 ガイドモードの使い方</p>
                        <p className={`text-gray-600 dark:text-gray-400 mt-1 ${textClasses.sm}`}>AIが少しずつ講義を行い、途中で理解度クイズを出してくれます。会話を通じて学習を進めましょう！</p>
                    </div>
                )}
                
                {activeMessages.map((msg, idx) => (
                    <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'model' && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm mt-1 mr-3">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                        )}
                        <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm transition-colors ${msg.role === 'user' ? 'bg-blue-600 dark:bg-blue-500 text-white rounded-tr-none' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-300 rounded-tl-none'}`}>
                            {msg.role === 'model' ? (
                                <div className={`leading-relaxed space-y-2 ${textClasses.base}`}>
                                    {renderFormattedText(msg.text)}
                                </div>
                            ) : (
                                <p className={`whitespace-pre-wrap leading-relaxed ${textClasses.base}`}>{msg.text}</p>
                            )}
                        </div>
                        {msg.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-gray-700 flex items-center justify-center shrink-0 shadow-sm mt-1 ml-3">
                                <User className="w-5 h-5 text-blue-600 dark:text-gray-300" />
                            </div>
                        )}
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start w-full">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm mt-1 mr-3">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center space-x-2 transition-colors h-12">
                            <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div><div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            {!isLoading && (
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 transition-colors">
                    {currentSuggestions.map((sug, i) => (
                        <button 
                            key={i} 
                            onClick={() => handleSend(sug)} 
                            className={`px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-300 transition-colors shadow-sm text-gray-600 dark:text-gray-300 ${textClasses.sm}`}
                        >
                            {mode === 'guide' ? sug : <><Sparkles className="w-3 h-3 inline mr-1 text-blue-500 dark:text-blue-400" />{sug}</>}
                        </button>
                    ))}
                </div>
            )}

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 transition-colors">
                <form onSubmit={handleSend} className="flex gap-2">
                    <input
                        type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={isLoading}
                        placeholder={mode === 'guide' ? "メッセージを入力..." : "AWSのサービスや概念について質問してください..."}
                        className={`flex-1 p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-transparent dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors shadow-inner ${textClasses.base}`}
                    />
                    <button type="submit" disabled={!input.trim() || isLoading} className="p-3 bg-blue-600 dark:bg-blue-500 text-white rounded-xl hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors shrink-0 shadow-sm flex items-center justify-center">
                        <Send className="w-6 h-6" />
                    </button>
                </form>
            </div>
        </div>
    );
}

// --- Guide View ---
function GuideView({ textClasses }) {
    return (
        <div className={`max-w-4xl mx-auto pb-10 animate-in fade-in duration-300 ${textClasses.base}`}>
            <h2 className={`font-bold mb-6 flex items-center ${textClasses.title}`}>
                <FileText className="mr-2 text-blue-600 dark:text-blue-400" /> 試験ガイド (要約)
            </h2>
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 prose dark:prose-invert max-w-none prose-blue transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b dark:border-gray-700 pb-2 mb-4">
                    <h3 className={`text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-2 sm:mb-0 ${textClasses.lg}`}>
                        1. 試験の概要（AWS認定クラウドプラクティショナー）
                    </h3>
                    <a 
                        href="https://docs.aws.amazon.com/ja_jp/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.pdf" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`inline-flex items-center px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg font-bold transition-colors shrink-0 ${textClasses.sm}`}
                    >
                        公式ガイド参照 <ExternalLink className="w-4 h-4 ml-1" />
                    </a>
                </div>
                <p className="text-gray-800 dark:text-gray-200"><strong>目的:</strong> AWSクラウドに関する総合的な理解を実証する。基礎的な知識（価値、セキュリティ、主要サービス、コストなど）を問う。</p>
                <p className="text-gray-800 dark:text-gray-200"><strong>対象者:</strong> AWSクラウドの設計、実装、オペレーションの経験が6か月以下の初心者。コーディングや深いアーキテクチャ設計は範囲外。</p>
                <ul className="text-gray-800 dark:text-gray-200">
                    <li><strong>問題数:</strong> 全65問（うちスコアに影響する採点対象は50問、<strong>スコアに影響しない採点対象外の設問が15問含まれます</strong>）</li>
                    <li><strong>解答タイプ:</strong> 択一選択問題、複数選択問題</li>
                    <li><strong>合格ライン:</strong> 1,000点満点中 <strong>700点</strong></li>
                </ul>

                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl transition-colors">
                    <p className={`text-amber-800 dark:text-amber-400 font-bold flex items-center mb-2 ${textClasses.sm}`}>
                        <AlertCircle className="w-5 h-5 mr-1 shrink-0" /> 本番試験：見たこともない問題が出た場合の対処法
                    </p>
                    <p className={`text-amber-900 dark:text-amber-200 leading-relaxed font-medium ${textClasses.sm}`}>
                        試験には今後の問題評価のために「スコアに影響しない採点対象外の設問（ダミー問題）」が15問紛れ込んでいます。どれがダミーかは受験者には分かりません。もし学習したことがない未知の用語や難問が出題されても、<strong>「これはダミー問題かもしれない」と割り切り、焦らずに推測で解答して次の問題に進む</strong>ことが合格への鍵です（推測による不正解のペナルティはありません）。
                    </p>
                </div>

                <h3 className={`text-gray-500 dark:text-gray-400 font-bold mt-10 mb-4 uppercase tracking-wider border-b dark:border-gray-700 pb-2 ${textClasses.lg}`}>2. 出題分野と割合</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead><tr className="bg-gray-50 dark:bg-gray-800/50"><th className="p-3 border-b dark:border-gray-700 text-gray-800 dark:text-gray-200">分野</th><th className="p-3 border-b dark:border-gray-700 text-gray-800 dark:text-gray-200">タイトル</th><th className="p-3 border-b dark:border-gray-700 text-gray-800 dark:text-gray-200">割合</th></tr></thead>
                        <tbody>
                            <tr><td className="p-3 border-b dark:border-gray-700 text-gray-800 dark:text-gray-300">第1分野</td><td className="p-3 border-b dark:border-gray-700 font-medium text-gray-800 dark:text-gray-300">クラウドのコンセプト</td><td className="p-3 border-b dark:border-gray-700 text-blue-600 dark:text-blue-400 font-bold">24%</td></tr>
                            <tr><td className="p-3 border-b dark:border-gray-700 text-gray-800 dark:text-gray-300">第2分野</td><td className="p-3 border-b dark:border-gray-700 font-medium text-gray-800 dark:text-gray-300">セキュリティとコンプライアンス</td><td className="p-3 border-b dark:border-gray-700 text-blue-600 dark:text-blue-400 font-bold">30%</td></tr>
                            <tr><td className="p-3 border-b dark:border-gray-700 text-gray-800 dark:text-gray-300">第3分野</td><td className="p-3 border-b dark:border-gray-700 font-medium text-gray-800 dark:text-gray-300">クラウドテクノロジーとサービス</td><td className="p-3 border-b dark:border-gray-700 text-blue-600 dark:text-blue-400 font-bold">34%</td></tr>
                            <tr><td className="p-3 border-b dark:border-gray-700 text-gray-800 dark:text-gray-300">第4分野</td><td className="p-3 border-b dark:border-gray-700 font-medium text-gray-800 dark:text-gray-300">請求、料金、サポート</td><td className="p-3 border-b dark:border-gray-700 text-blue-600 dark:text-blue-400 font-bold">12%</td></tr>
                        </tbody>
                    </table>
                </div>

                <h3 className={`text-gray-500 dark:text-gray-400 font-bold mt-10 mb-4 uppercase tracking-wider border-b dark:border-gray-700 pb-2 ${textClasses.lg}`}>3. 各分野のタスクステートメント（詳細）</h3>
                <div className="space-y-6">
                    <div>
                        <h4 className={`font-bold text-blue-600 dark:text-blue-400 ${textClasses.base}`}>第1分野: クラウドのコンセプト</h4>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-800 dark:text-gray-200">
                            <li><strong>1.1 AWS クラウドの利点を定義する:</strong> 高可用性、伸縮性、俊敏性などクラウドの価値を理解する。</li>
                            <li><strong>1.2 AWS クラウドの設計原則を特定する:</strong> Well-Architected Frameworkの6つの柱を理解する。</li>
                            <li><strong>1.3 クラウドへの移行の利点と戦略を理解する:</strong> AWS CAFを用いた移行戦略とビジネス価値を把握する。</li>
                            <li><strong>1.4 クラウドエコノミクスのコンセプトを理解する:</strong> 固定費と変動費、適切なサイジングなどコスト最適化を理解する。</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className={`font-bold text-blue-600 dark:text-blue-400 ${textClasses.base}`}>第2分野: セキュリティとコンプライアンス</h4>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-800 dark:text-gray-200">
                            <li><strong>2.1 AWS の責任共有モデルを理解する:</strong> AWSとお客様それぞれの責任範囲を把握する。</li>
                            <li><strong>2.2 セキュリティ、ガバナンス、コンプライアンスのコンセプトを理解する:</strong> 暗号化、CloudTrail、Configなどの活用方法を理解する。</li>
                            <li><strong>2.3 AWS アクセス管理機能を特定する:</strong> IAM、最小権限の原則、ルートユーザーの保護を理解する。</li>
                            <li><strong>2.4 セキュリティのためのコンポーネントとリソースを特定する:</strong> WAF、Shield、GuardDuty、Inspectorなどの目的を特定する。</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className={`font-bold text-blue-600 dark:text-blue-400 ${textClasses.base}`}>第3分野: クラウドテクノロジーとサービス</h4>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-800 dark:text-gray-200">
                            <li><strong>3.1 クラウドでのデプロイと運用の方法を定義する:</strong> CLI、マネジメントコンソール、IaCなどのオプションを理解する。</li>
                            <li><strong>3.2 AWS のグローバルインフラストラクチャを定義する:</strong> リージョン、AZ、エッジロケーションの概念と高可用性を理解する。</li>
                            <li><strong>3.3 コンピューティングサービスを特定する:</strong> EC2、ECS/EKS、Lambda等の用途を特定する。</li>
                            <li><strong>3.4 データベースサービスを特定する:</strong> RDS、DynamoDB、Aurora等の用途を特定する。</li>
                            <li><strong>3.5 ネットワークサービスを特定する:</strong> VPC、Route 53、Direct Connect等の用途を特定する。</li>
                            <li><strong>3.6 ストレージサービスを特定する:</strong> S3、EBS、EFS、Storage Gateway等の用途を特定する。</li>
                            <li><strong>3.7 AI/ML サービスと分析サービスを特定する:</strong> SageMaker、Athena、QuickSight等の用途を特定する。</li>
                            <li><strong>3.8 その他の範囲内の AWS サービスカテゴリを特定する:</strong> SNS、SQS、EventBridge等の用途を特定する。</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className={`font-bold text-blue-600 dark:text-blue-400 ${textClasses.base}`}>第4分野: 請求、料金、サポート</h4>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-800 dark:text-gray-200">
                            <li><strong>4.1 AWS の料金モデルを比較する:</strong> オンデマンド、RI、スポットインスタンスやデータ転送コストを理解する。</li>
                            <li><strong>4.2 請求、予算、コスト管理のためのリソースを理解する:</strong> Organizations、Cost Explorer、Budgetsの機能を理解する。</li>
                            <li><strong>4.3 AWSの技術リソースとサポートオプションを特定する:</strong> 各種サポートプラン、Trusted Advisorの役割を理解する。</li>
                        </ul>
                    </div>
                </div>

                <h3 className={`text-gray-500 dark:text-gray-400 font-bold mt-10 mb-4 uppercase tracking-wider border-b dark:border-gray-700 pb-2 ${textClasses.lg}`}>4. 旧バージョン (C01) からの主な変更点</h3>
                <ul className="list-disc pl-5 space-y-2 text-gray-800 dark:text-gray-200">
                    <li>第2分野（セキュリティ）の比重が増加: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">25% → 30%</code></li>
                    <li>第4分野（請求）の比重が減少: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">16% → 12%</code></li>
                    <li><strong>AWS クラウド導入フレームワーク (AWS CAF)</strong> に関する知識が追加されました。</li>
                    <li>削除されたトピックはなく、タスクの細分化・再分類が行われています。</li>
                </ul>
            </div>
        </div>
    );
}

// --- Roadmap View (学習ロードマップ) ---
function RoadmapView({ stats, updateStats, textClasses }) {
    const toggleTask = (taskId) => {
        const currentProgress = stats.roadmapProgress || [];
        let newProgress;
        if (currentProgress.includes(taskId)) {
            newProgress = currentProgress.filter(id => id !== taskId);
        } else {
            newProgress = [...currentProgress, taskId];
        }
        updateStats({ ...stats, roadmapProgress: newProgress });
    };

    return (
        <div className={`max-w-4xl mx-auto pb-10 animate-in fade-in duration-300 ${textClasses.base}`}>
            <div className="mb-8">
                <h2 className={`font-bold mb-2 flex items-center ${textClasses.title}`}>
                    <Map className="mr-2 text-blue-600 dark:text-blue-400" /> 学習ロードマップ
                </h2>
                <p className={`text-gray-500 dark:text-gray-400 ${textClasses.sm}`}>
                    初学者から合格レベルに到達するためのガイドです。学習が終わった項目にチェックを入れましょう。
                </p>
            </div>

            <div className="space-y-6">
                {ROADMAP_DATA.map((week, wIdx) => {
                    const isWeekComplete = week.tasks.every(task => stats.roadmapProgress?.includes(task.id));
                    
                    return (
                        <div key={week.id} className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border transition-colors ${isWeekComplete ? 'border-green-200 dark:border-green-800/50 bg-green-50/30 dark:bg-green-900/10' : 'border-gray-100 dark:border-gray-700'}`}>
                            <div className="p-5 md:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                <h3 className={`font-bold text-gray-800 dark:text-gray-100 flex items-center ${textClasses.lg}`}>
                                    {isWeekComplete && <CheckCircle className="w-5 h-5 text-green-500 mr-2" />}
                                    {week.title}
                                </h3>
                            </div>
                            <div className="p-3 md:p-5 space-y-2">
                                {week.tasks.map((task, tIdx) => {
                                    const isCompleted = stats.roadmapProgress?.includes(task.id);
                                    return (
                                        <div 
                                            key={task.id} 
                                            onClick={() => toggleTask(task.id)}
                                            className={`flex items-start p-3 md:p-4 rounded-xl cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isCompleted ? 'opacity-60' : ''}`}
                                        >
                                            <button className="mr-3 mt-0.5 shrink-0 focus:outline-none">
                                                {isCompleted ? (
                                                    <CheckSquare className="w-6 h-6 text-green-500" />
                                                ) : (
                                                    <Square className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                                                )}
                                            </button>
                                            <div>
                                                <p className={`font-bold transition-colors ${isCompleted ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                                                    {task.title}
                                                </p>
                                                <p className={`text-gray-500 dark:text-gray-400 mt-1 ${textClasses.sm}`}>
                                                    {task.desc}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}